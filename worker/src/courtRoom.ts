import { applyExternalCourtRuling, applyExternalCourtTurn, castJuryDraw, castJuryVote, CourtRuntimeError, createCourtSession, rehearsalTurn, validateCourtSession } from '../../src/utils/courtRuntime';
import { toGameCard, gameCardSearchBlob } from '../../src/utils/gameCard';
import { juryTotals, nextBuiltinRetry, platformCase, platformTurn, type BuiltinRetry } from '../../src/utils/platformGame';
import type { CourtRole, CourtSession } from '../../src/types';
import { applyCourtCast, drawCourtCast, getCourtCast } from '../../src/data/courtCasts';
import type { AgentState, CreateGameInput, CreateGameResult, GameInvitation, InvitationContext, JuryProp, JuryReaction, JuryReactionInput, JuryWinner, PrepareVerdictsInput, PublicGame, PublicSeat } from '../../src/types/platform';
import type { Env } from './env';
import { fail, HttpError, scopedToken } from './env';
import { ensureSchema } from './d1';
import { sha256 } from './sha256';
import { generateBuiltinJudgeTurn, generatePartyTurn } from './builtinJudge';

const ROLES: CourtRole[] = ['judge', 'plaintiff', 'defendant'];
const JURY_PROPS: readonly JuryProp[] = ['tomato', 'flipflop', 'egg', 'popcorn', 'flower'];
const RECENT_REACTIONS = 20;
const REACTION_COOLDOWN_MS = 1200;
const REACTION_RECEIPTS = 16;
const EXTERNAL_TURN_LIMIT = 180;
const POSITION_LIMIT = 400;
const BROWSER_ROOM_READS = new Set(['', '/jury-seat', '/events', '/wait']);
const BROWSER_ROOM_MUTATIONS = new Set(['/invite', '/respond', '/jury-seat', '/reactions', '/votes']);
const DRAW_LINES: Record<string, string> = {
  everyday: '瓜子秤没偏，今天谁也不多拿一粒。',
  city: '两边信号一样强，本台暂停插播。',
  night: '这单平手结案，谁也别把工单退回来。',
  gavel: '惊堂木落下，两边各一票，今日就此退堂。',
  chill: '一人一票，扯平了。现在谁去开罐头？',
};
const DAY = 24 * 60 * 60 * 1000;
const copy = <T,>(x: T): T => structuredClone(x);
const hash = (value: string) => sha256(value);
const roomAccessKey = (ownerToken: string) => hash(`court-room-key:${ownerToken}`);
function text(value: unknown, label: string, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) return fail(400, 'INVALID_INPUT', `${label}无效。`);
  return value.trim();
}
function role(value: unknown): CourtRole { return ROLES.includes(value as CourtRole) ? value as CourtRole : fail(400, 'INVALID_ROLE', '只有法官、原告、被告三个 Agent 席位。'); }

interface Seat extends PublicSeat { tokenHash?: string; ticket?: string; claim?: { actionId: string; fingerprint: string; seatToken: string } }
interface Prepared { plaintiff: unknown; defendant: unknown; preparedAt: number; source: PublicSeat['source']; publishedAt?: number }
interface Party {
  visibility: 'public' | 'invite';
  defendant: 'builtin' | 'friend';
  demand: string;
  defense?: string;
  roomKeyHash?: string;
  defenseTicketHash?: string;
}
interface InternalGame {
  id: string; mode: 'practice' | 'multiplayer'; revision: number; createdAt: number; updatedAt: number;
  actionRevision?: number;
  session: CourtSession; seats: Record<CourtRole, Seat>; ownerHash: string; hidden?: boolean;
  votes: Record<string, JuryWinner>; deadlineAt?: number; outcome: 'pending' | JuryWinner | 'draw' | 'unresolved'; prepared?: Prepared;
  postJury?: true; publishedAt?: number; builtinRetry?: BuiltinRetry;
  party?: Party; jurors?: string[]; reactions?: JuryReaction[];
  actions: Record<string, { fingerprint: string; result: unknown }>;
}
interface ReactionHistory { lastAt: number; receipts: { actionId: string; fingerprint: string }[] }
interface Subscription { revision: number; send: (game: PublicGame) => void; close: () => void }
interface Waiter { revision: number; resolve: (state: AgentState | PublicGame) => void; reject: (error: Error) => void; token: string | null; timer: ReturnType<typeof setTimeout>; cleanup: () => void }
interface CreateReceipt { fingerprint: string; result: CreateGameResult }
const MAX_STREAMS = 64;

/**
 * One Durable Object per game: the single owner of live session state, exactly like
 * the Node CourtService singleton, but scoped to one room. Tokens and tickets embed
 * the game id so the worker can route without any global index. The 1-second Node
 * tick is replaced by a Durable Object alarm at the jury deadline, and lobby /
 * judgment listings are projected into D1 on state transitions only.
 */
export class CourtRoom {
  private game?: InternalGame;
  private subscriptions = new Set<Subscription>();
  private waiters = new Set<Waiter>();
  private projectedKey?: string;
  private mutation: Promise<unknown> = Promise.resolve();
  readonly now = () => Date.now();
  constructor(private ctx: { storage: DurableObjectStorage }, private env: Env) {}

  private async load(): Promise<InternalGame | undefined> {
    if (this.game) return this.game;
    const stored = await this.ctx.storage.get<InternalGame>('game');
    if (!this.game && stored) { stored.session = validateCourtSession(stored.session); this.game = stored; }
    return this.game;
  }
  private async require(): Promise<InternalGame> { return await this.load() || fail(404, 'NOT_FOUND', '找不到这间法庭。'); }
  private mutate<T>(action: () => Promise<T>): Promise<T> {
    // Concurrent ballots and replies must each read the room after the previous write.
    const result = this.mutation.then(action);
    this.mutation = result.catch(() => {});
    return result;
  }
  private async browserRoom(request: Request): Promise<InternalGame> {
    const game = await this.require();
    if (game.party?.visibility === 'invite') {
      const key = request.headers.get('x-court-room-key');
      if (!key || key.length !== 64 || hash(key) !== game.party.roomKeyHash) return fail(404, 'NOT_FOUND', '找不到这间法庭。');
    }
    return game;
  }
  private auth(game: InternalGame, rawToken: string): CourtRole {
    if (typeof rawToken !== 'string' || rawToken.length > 200) return fail(401, 'AUTH', '需要有效的席位令牌。');
    const digest = hash(rawToken);
    for (const r of ROLES) if (game.seats[r].tokenHash === digest) return r;
    return fail(401, 'AUTH', '席位令牌无效。');
  }
  private agentsReady(game: InternalGame) { return ROLES.every(r => game.seats[r].source !== 'external' || game.seats[r].status === 'claimed'); }
  private juryMinimum(game: InternalGame) {
    if (game.party) return game.party.defendant === 'friend' ? 2 : 1;
    return game.mode === 'practice' ? 1 : 3;
  }
  private canRun(game: InternalGame) { return this.agentsReady(game) && (!game.jurors || game.jurors.length >= this.juryMinimum(game)); }
  private actionRevision(game: InternalGame) { return game.actionRevision ?? game.revision; }
  private public(game: InternalGame): PublicGame {
    const running = this.canRun(game);
    const waitingForJurors = this.agentsReady(game) || (game.party?.defendant === 'friend' && game.jurors?.length === 1);
    const current = running && game.outcome !== 'unresolved' ? platformTurn(game.session, game.postJury) : undefined;
    const { plaintiff, defendant, total } = juryTotals(game.votes);
    return copy({ id: game.id, mode: game.mode, revision: game.revision, createdAt: game.createdAt, updatedAt: game.updatedAt,
      status: game.session.status === 'completed' ? 'completed' : game.outcome === 'unresolved' ? 'unresolved' : !running
        ? waitingForJurors ? 'waiting-jurors' : 'waiting-agents'
        : current?.phase === 'verdict' ? 'waiting-verdict' : current ? 'running' : 'waiting-jury',
      session: game.session,
      seats: Object.fromEntries(ROLES.map(r => { const { role: seatRole, source, status, agentName } = game.seats[r]; return [r, { role: seatRole, source, status, ...(agentName ? {agentName} : {}) }]; })) as Record<CourtRole, PublicSeat>,
      currentRole: current?.role ?? null,
      currentTurnId: current ? `${game.session.id}-turn-${game.session.turns.length + 1}` : null,
      guidePath: '/agents/guide.md',
      jury: { plaintiffVotes: plaintiff, defendantVotes: defendant, total, minimumVotes: this.juryMinimum(game), ...(game.deadlineAt ? {deadlineAt: game.deadlineAt} : {}), outcome: game.outcome },
      ...(game.jurors && { audience: { seated: game.jurors.length, required: this.juryMinimum(game), reactions: game.reactions ?? [] } }),
      ...(game.party && { party: { visibility: game.party.visibility, defendant: game.party.defendant } }),
      verdict: game.postJury ? { flow: 'post-jury', prepared: false, ...(game.publishedAt !== undefined ? {publishedAt: game.publishedAt, source: game.seats.judge.source} : {}) }
        : { ...(game.party && { flow: 'prepared' as const }), prepared: !!game.prepared, ...(game.prepared ? {preparedAt: game.prepared.preparedAt, source: game.prepared.source, ...(game.prepared.publishedAt ? {publishedAt: game.prepared.publishedAt} : {})} : {}) },
    });
  }
  private seatTicket(game: InternalGame, secret: string): { seat: Seat; role: CourtRole } {
    const full = `${game.id}.${secret}`;
    for (const r of ROLES) if (game.seats[r].ticket === full) return { seat: game.seats[r], role: r };
    return fail(404, 'NOT_FOUND', '邀请不存在。');
  }
  /** Commit the mutated copy, persist it, notify streams and project the D1 card. */
  private async save(game: InternalGame, extras?: { creation?: CreateReceipt; reaction?: { key: string; history: ReactionHistory } }) {
    const alarm = this.nextAlarm(game);
    await this.ctx.storage.transaction(async storage => {
      await storage.put('game', game);
      if (extras?.creation) await storage.put('create', extras.creation);
      if (extras?.reaction) await storage.put(extras.reaction.key, extras.reaction.history);
      const current = await storage.getAlarm();
      if (current === alarm) return;
      if (alarm === null) await storage.deleteAlarm();
      else await storage.setAlarm(alarm);
    });
    this.game = game;
    for (const subscription of [...this.subscriptions]) if (game.revision > subscription.revision) {
      subscription.revision = game.revision;
      try { subscription.send(this.public(game)); } catch { this.subscriptions.delete(subscription); subscription.close(); }
    }
    for (const waiter of [...this.waiters]) if ((waiter.token ? this.actionRevision(game) : game.revision) > waiter.revision) {
      waiter.cleanup(); waiter.resolve(waiter.token ? this.state(game, waiter.token) : this.public(game));
    }
    await this.project(game);
  }
  private change(game: InternalGame, audienceOnly = false) {
    game.actionRevision = audienceOnly ? this.actionRevision(game) : game.revision + 1;
    game.revision++;
    game.updatedAt = this.now();
  }
  private seal(game: InternalGame) { if (!game.session.pendingTurns.length && !game.deadlineAt) game.deadlineAt = this.now() + DAY; }
  private pump(game: InternalGame) {
    if (!this.canRun(game) || game.outcome === 'unresolved') return;
    while (game.session.pendingTurns.length) {
      const step = game.session.pendingTurns[0];
      if (game.seats[step.role].source !== 'practice') break;
      game.session = applyExternalCourtTurn(game.session, rehearsalTurn(game.session, step));
      this.change(game);
    }
    this.seal(game);
    if (!game.postJury && !game.session.pendingTurns.length && game.seats.judge.source === 'practice' && !game.prepared) {
      const make = (winner: JuryWinner) => { const fork = castJuryVote(game.session, winner); return rehearsalTurn(fork, { role: 'judge', phase: 'verdict', interventionIds: [] }); };
      this.prepare(game, make('plaintiff'), make('defendant'), 'practice');
    }
    this.settle(game);
  }
  private prepare(game: InternalGame, plaintiff: unknown, defendant: unknown, source: Prepared['source']) {
    if (game.session.pendingTurns.length || game.session.status !== 'awaiting-ruling') fail(409, 'NOT_SEALED', '十轮交锋结束后才能准备条件判词。');
    for (const [winner, payload] of [['plaintiff', plaintiff], ['defendant', defendant]] as const) {
      const turn = applyExternalCourtRuling(castJuryVote(game.session, winner), payload).turns.at(-1)!;
      if (game.party && [...turn.text].length > EXTERNAL_TURN_LIMIT) fail(400, 'TURN_TOO_LONG', '判词超过本庭的发言长度。');
    }
    game.prepared = { plaintiff: copy(plaintiff), defendant: copy(defendant), preparedAt: this.now(), source };
    this.change(game);
  }
  private settle(game: InternalGame) {
    if (game.session.pendingTurns.length || game.session.status === 'completed' || game.outcome === 'unresolved') return;
    const { plaintiff, defendant, total } = juryTotals(game.votes);
    const enough = total >= this.juryMinimum(game);
    let next: InternalGame['outcome'] = game.outcome;
    if (next === 'pending' && enough && plaintiff !== defendant) next = plaintiff > defendant ? 'plaintiff' : 'defendant';
    if (next === 'pending' && enough && game.party && game.prepared && plaintiff === defendant) next = 'draw';
    if (next === 'pending' && game.deadlineAt && this.now() >= game.deadlineAt) next = 'unresolved';
    if (next !== game.outcome) { game.outcome = next; this.change(game); }
    if (next === 'draw') {
      const evidenceIds = game.session.evidences.map(item => item.id);
      const consideredInterventionIds = game.session.interventions.map(item => item.id);
      const quote = DRAW_LINES[getCourtCast(game.session.caseData).id];
      const result = '两边各得一票，本庭判平。';
      game.session = applyExternalCourtRuling(castJuryDraw(game.session), {
        speaker: 'judge', text: `陪审报票：原告 ${plaintiff} 票，被告 ${defendant} 票。${quote}`,
        responseTo: consideredInterventionIds, evidenceIds,
        ruling: { winner: 'draw', result, quote, penalty: [], reasons: ['双方各有一票，陪审席没有多数。'], evidenceIds, consideredInterventionIds },
      });
      if (game.prepared) game.prepared.publishedAt = this.now();
      this.change(game);
      return;
    }
    if (next !== 'plaintiff' && next !== 'defendant') return;
    if (game.postJury) {
      if (!game.session.juryVote) game.session = castJuryVote(game.session, next);
      const step = platformTurn(game.session, game.postJury);
      if (step && game.seats.judge.source === 'practice') this.acceptTurn(game, rehearsalTurn(game.session, step));
    } else if (game.prepared) {
      let payload = game.prepared[next];
      if (game.party) {
        const turn = payload as { text: string };
        payload = { ...turn, text: `原告 ${plaintiff} 票，被告 ${defendant} 票。${next === 'plaintiff' ? '原告' : '被告'}胜。${turn.text}` };
      }
      game.session = applyExternalCourtRuling(castJuryVote(game.session, next), payload);
      game.prepared.publishedAt = this.now(); this.change(game);
    }
  }
  private acceptTurn(game: InternalGame, payload: unknown) {
    const verdict = platformTurn(game.session, game.postJury)?.phase === 'verdict';
    if (verdict) {
      game.session = applyExternalCourtRuling(game.session, payload);
      game.publishedAt = this.now();
    } else game.session = applyExternalCourtTurn(game.session, payload);
    this.change(game);
    if (!verdict) this.pump(game);
  }
  private invitation(game: InternalGame, r: CourtRole): GameInvitation {
    const seat = game.seats[r];
    if (seat.source !== 'external' || seat.status === 'claimed') return fail(409, 'SEAT_UNAVAILABLE', '该席位不能领取入场邀请。');
    if (!seat.ticket) { seat.ticket = scopedToken(game.id); seat.status = 'reserved'; this.change(game); }
    return { ticket: seat.ticket, role: r, path: `/join/${seat.ticket}` };
  }
  private dedup(game: InternalGame, actorKey: string, input: { clientActionId: string }, kind: string): { key: string; fingerprint: string; existing?: unknown } {
    const key = `${actorKey}:${text(input.clientActionId, '操作编号')}`;
    const fingerprint = JSON.stringify({ kind, input });
    const previous = game.actions[key];
    if (previous && previous.fingerprint !== fingerprint) fail(409, 'ACTION_CONFLICT', '同一操作编号不能提交不同内容。');
    return { key, fingerprint, ...(previous ? { existing: previous.result } : {}) };
  }
  private state(game: InternalGame, rawToken: string): AgentState {
    const r = this.auth(game, rawToken); const pub = this.public(game);
    const noMoreTurns = !game.session.pendingTurns.some(step => step.role === r);
    const finished = game.session.status === 'completed' || (game.postJury && game.outcome === 'unresolved') || (r === 'judge' ? !!game.prepared : noMoreTurns);
    const canSubmit = !finished && pub.currentRole === r;
    const prepare = !game.postJury && !finished && r === 'judge' && game.session.status === 'awaiting-ruling';
    return { game: pub, role: r, ...this.position(game, r), roleFinished: finished, canSubmit, turnId: canSubmit ? pub.currentTurnId : null, expectedRevision: this.actionRevision(game),
      action: finished ? 'finished' : prepare ? 'prepare_verdicts' : canSubmit ? (pub.status === 'waiting-verdict' ? 'submit_verdict' : 'submit_turn') : 'wait', guidePath: '/agents/guide.md', rolePromptPath: `/agents/roles/${r}.md`,
      receipts: Object.entries(game.actions).filter(([key]) => key.startsWith(`${hash(rawToken)}:`)).map(([key, value]) => ({ clientActionId: key.slice(65), kind: JSON.parse(value.fingerprint).kind, ...(value.result as object) })) };
  }

  private position(game: InternalGame, r: CourtRole) {
    return r === 'plaintiff' && game.party ? { position: game.party.demand } : {};
  }

  private async project(game: InternalGame) {
    if (!this.env.DB || game.party?.visibility === 'invite') return;
    // The card only changes on transitions, not on every turn, keeping D1 writes bounded.
    const seatsSig = ROLES.map(r => `${r}:${game.seats[r].status}`).join(',');
    const key = [game.mode, game.hidden ? 1 : 0, game.session.status, game.outcome, seatsSig, game.jurors?.length, game.prepared ? (game.prepared.publishedAt ? 2 : 1) : 0].join('|');
    if (this.projectedKey === key) return;
    const card = toGameCard(this.public(game));
    try {
      await ensureSchema(this.env);
      await this.env.DB.prepare(
        'INSERT INTO games (id, mode, status, hidden, created_at, updated_at, title, search, card) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(id) DO UPDATE SET mode=excluded.mode, status=excluded.status, hidden=excluded.hidden, updated_at=excluded.updated_at, title=excluded.title, search=excluded.search, card=excluded.card'
      ).bind(game.id, game.mode, card.status, game.hidden ? 1 : 0, game.createdAt, card.updatedAt, card.title, gameCardSearchBlob(card), JSON.stringify(card)).run();
      this.projectedKey = key;
    } catch (error) { this.projectedKey = undefined; console.error('court D1 projection failed', game.id, error); }
  }
  private nextAlarm(game: InternalGame): number | null {
    const turnId = this.builtinTurn(game);
    if (turnId) return game.builtinRetry?.turnId === turnId ? game.builtinRetry.after : this.now();
    return game.outcome === 'pending' ? game.deadlineAt ?? null : null;
  }
  private builtinTurn(game: InternalGame): string | undefined {
    if (game.outcome === 'unresolved' || !this.canRun(game)) return;
    const step = platformTurn(game.session, game.postJury);
    if (step && game.seats[step.role].source === 'builtin') return `${game.session.id}-turn-${game.session.turns.length + 1}`;
  }
  private async runBuiltin(game: InternalGame, attempt: BuiltinRetry) {
    const { turnId } = attempt;
    try {
      const apiKey = this.env.OPENROUTER_API_KEY?.trim();
      if (!apiKey) throw new Error('Built-in judge credential is unavailable');
      const pub = this.public(game);
      const payload = game.party
        ? await generatePartyTurn(apiKey, pub, pub.currentRole!, { demand: game.party.demand, defense: game.party.defense }, attempt.attempts - 1)
        : await generateBuiltinJudgeTurn(apiKey, pub, attempt.attempts - 1);
      await this.mutate(async () => {
        const current = await this.load();
        if (!current || this.builtinTurn(current) !== turnId || current.builtinRetry?.attempts !== attempt.attempts) return;
        const next = copy(current);
        if (next.party && next.session.pendingTurns.length === 1) {
          const { seal, plaintiff, defendant } = payload as { seal: unknown; plaintiff: unknown; defendant: unknown };
          this.acceptTurn(next, seal);
          this.prepare(next, plaintiff, defendant, 'builtin');
        } else this.acceptTurn(next, payload);
        delete next.builtinRetry;
        await this.save(next);
      });
    } catch (error) {
      console.error('court built-in judge turn failed', game.id, turnId, error);
      if (game.party && error instanceof CourtRuntimeError && error.code === 'INVALID_RESPONSE') {
        await this.mutate(async () => {
          const current = await this.load();
          if (!current || this.builtinTurn(current) !== turnId || current.builtinRetry?.attempts !== attempt.attempts) return;
          const retryDelay = Math.min(2_000 * 2 ** (attempt.attempts - 1), 30_000);
          await this.save({ ...current, builtinRetry: { ...attempt, after: this.now() + retryDelay } });
        });
      }
    }
  }
  async alarm() {
    const scheduled = await this.mutate(async () => {
      const game = await this.load();
      if (!game) return;
      const next = copy(game);
      this.settle(next);
      const turnId = this.builtinTurn(next);
      if (!turnId || (next.builtinRetry?.turnId === turnId && next.builtinRetry.after > this.now())) {
        if (next.revision !== game.revision) await this.save(next);
        return;
      }
      const attempt = nextBuiltinRetry(turnId, this.now(), next.builtinRetry);
      // Schedule recovery before the inference request so a killed alarm can be resumed.
      next.builtinRetry = attempt;
      await this.save(next);
      return { game: next, attempt };
    });
    if (scheduled) await this.runBuiltin(scheduled.game, scheduled.attempt);
  }

  private async create(input: CreateGameInput, gameId: string, creator?: unknown): Promise<CreateGameResult> {
    const r = role(input.role);
    const host = input.party === undefined ? undefined : text(creator, '访客凭证', 200);
    const fingerprint = host === undefined ? JSON.stringify(input) : JSON.stringify({ input, host });
    const prior = await this.ctx.storage.get<CreateReceipt>('create');
    if (this.game || prior) {
      if (!prior || prior.fingerprint !== fingerprint) return fail(409, 'ACTION_CONFLICT', '该创建编号已被其他内容使用。');
      const game = await this.require();
      return { ...copy(prior.result), game: this.public(game), ...(game.party?.visibility === 'invite' && { roomKey: roomAccessKey(prior.result.ownerToken) }) };
    }
    if (input.mode !== undefined && input.mode !== 'practice' && input.mode !== 'multiplayer') return fail(400, 'INVALID_MODE', '未知游戏模式。');
    if (input.party !== undefined) {
      const party = input.party;
      if (!party || r !== 'plaintiff' || !['public', 'invite'].includes(party.visibility)
        || !['builtin', 'external'].includes(party.plaintiff) || !['builtin', 'friend'].includes(party.defendant)) {
        return fail(400, 'INVALID_PARTY', '开庭时请选好旁听范围和原被告出场方式。');
      }
      if (!this.env.OPENROUTER_API_KEY?.trim()) return fail(503, 'BUILTIN_JUDGE_UNAVAILABLE', '法官暂时没到，稍后再来开庭。');
      return this.createParty(input.caseData, party, gameId, host!, fingerprint);
    }
    const mode = input.mode || 'practice';
    // Replay the empty session through the public validator to strip scripts, credentials and unknown fields.
    const { caseData, builtinJudgeName } = platformCase(input, Boolean(this.env.OPENROUTER_API_KEY?.trim()), fail);
    const session = validateCourtSession(createCourtSession(caseData, 'external'));
    const ownerToken = scopedToken(gameId); const time = this.now();
    const game: InternalGame = { id: gameId, mode, revision: 1, createdAt: time, updatedAt: time, session,
      seats: Object.fromEntries(ROLES.map(x => [x, { role: x, source: mode === 'multiplayer' || x === r ? 'external' : 'practice', status: mode === 'multiplayer' || x === r ? 'open' : 'practice' }])) as Record<CourtRole, Seat>,
      ownerHash: hash(ownerToken), votes: {}, outcome: 'pending', actions: {}, postJury: true, jurors: [] };
    if (builtinJudgeName) game.seats.judge = { role: 'judge', source: 'builtin', status: 'builtin', agentName: builtinJudgeName };
    const invitation = this.invitation(game, r);
    const result: CreateGameResult = { game: this.public(game), ownerToken, invitation };
    await this.save(game, { creation: { fingerprint, result } });
    return result;
  }
  private async createParty(caseData: CreateGameInput['caseData'], config: NonNullable<CreateGameInput['party']>, gameId: string, host: string, fingerprint: string): Promise<CreateGameResult> {
    const demand = text(config.demand, '诉求', POSITION_LIMIT);
    const defense = config.defense !== undefined ? text(config.defense, '答辩立场', POSITION_LIMIT) : undefined;
    if (defense && config.defendant === 'friend') return fail(400, 'INVALID_PARTY', '好友到庭后自己答辩。');
    const cast = drawCourtCast();
    const session = validateCourtSession(createCourtSession(applyCourtCast(caseData, cast.id), 'external'));
    const ownerToken = scopedToken(gameId);
    const roomKey = config.visibility === 'invite' ? roomAccessKey(ownerToken) : undefined;
    const defenseTicket = config.defendant === 'friend' ? scopedToken(gameId) : undefined;
    const time = this.now();
    const game: InternalGame = {
      id: gameId, mode: 'multiplayer', revision: 1, createdAt: time, updatedAt: time, session,
      seats: {
        judge: { role: 'judge', source: 'builtin', status: 'builtin', agentName: cast.judgeName },
        plaintiff: { role: 'plaintiff', source: config.plaintiff, status: config.plaintiff === 'external' ? 'open' : 'builtin' },
        defendant: config.defendant === 'friend' ? { role: 'defendant', source: 'external', status: 'open' } : { role: 'defendant', source: 'builtin', status: 'builtin' },
      },
      ownerHash: hash(ownerToken), votes: {}, outcome: 'pending', actions: {}, jurors: [host],
      party: {
        visibility: config.visibility, defendant: config.defendant, demand,
        ...(defense && { defense }),
        ...(roomKey && { roomKeyHash: hash(roomKey) }),
        ...(defenseTicket && { defenseTicketHash: hash(defenseTicket) }),
      },
    };
    const invitation = config.plaintiff === 'external' ? this.invitation(game, 'plaintiff') : undefined;
    const result: CreateGameResult = {
      game: this.public(game), ownerToken,
      ...(invitation && { invitation }),
      ...(defenseTicket && { defenseInvitation: { ticket: defenseTicket, role: 'defendant', path: `/join/${defenseTicket}` } }),
    };
    await this.save(game, { creation: { fingerprint, result } });
    return { ...result, ...(roomKey && { roomKey }) };
  }
  private async invite(id: string, input: { role: CourtRole; ownerToken?: string }): Promise<GameInvitation> {
    const stored = await this.require();
    if (stored.id !== id) return fail(404, 'NOT_FOUND', '找不到这间法庭。');
    if (stored.party) return fail(403, 'INVITATION_REQUIRED', '请用开庭时发出的邀请。');
    const game = copy(stored); const r = role(input.role);
    if (game.mode !== 'multiplayer' && (!input.ownerToken || hash(input.ownerToken) !== game.ownerHash)) return fail(403, 'OWNER_REQUIRED', '只有创建者可以取回排练入场邀请。');
    const invitation = this.invitation(game, r); await this.save(game); return invitation;
  }
  private async inspect(gameId: string, secret: string) {
    const game = await this.require();
    const { role: r } = this.seatTicket(game, secret);
    return { gameId: game.id, role: r, ...this.position(game, r), claimed: !!game.seats[r].claim, game: this.public(game), guidePath: '/agents/guide.md', rolePromptPath: `/agents/roles/${r}.md` };
  }
  private async context(gameId: string, secret: string): Promise<InvitationContext> {
    const info = await this.inspect(gameId, secret);
    const game = await this.require();
    const claim = game.seats[info.role].claim;
    return claim ? this.state(game, claim.seatToken) : {
      game: info.game, gameId: info.gameId, role: info.role, ...this.position(game, info.role), claimed: false, action: 'claim',
      guidePath: info.guidePath, rolePromptPath: info.rolePromptPath, claimPath: `/api/invitations/${game.id}.${secret}/claim`,
    };
  }
  private async join(secret: string, input: { agentName: string; clientActionId: string }) {
    const stored = await this.require();
    const { seat, role: r } = this.seatTicket(stored, secret);
    const agentName = text(input.agentName, 'Agent 名称', 100), actionId = text(input.clientActionId, '操作编号');
    const fingerprint = JSON.stringify({ agentName });
    if (seat.claim) {
      if (seat.claim.actionId !== actionId || seat.claim.fingerprint !== fingerprint) return fail(409, 'TICKET_CLAIMED', '入场邀请已被领取。');
      return { seatToken: seat.claim.seatToken, gameId: stored.id, role: r, state: this.state(stored, seat.claim.seatToken) };
    }
    const game = copy(stored); const seatToken = scopedToken(game.id);
    const target = this.seatTicket(game, secret);
    target.seat.claim = { actionId, fingerprint, seatToken };
    game.seats[r] = { ...target.seat, status: 'claimed', agentName, tokenHash: hash(seatToken) };
    this.change(game); this.pump(game); await this.save(game);
    return { seatToken, gameId: game.id, role: r, state: this.state(game, seatToken) };
  }
  private async speak(rawToken: string, input: { turnId: string; revision: number; clientActionId: string; payload: unknown }): Promise<AgentState> {
    const stored = await this.require(); const r = this.auth(stored, rawToken);
    const game = copy(stored); const action = this.dedup(game, hash(rawToken), input, 'turn');
    if (action.existing) return this.state(stored, rawToken);
    const state = this.state(stored, rawToken);
    if (!state.canSubmit) fail(409, 'NOT_YOUR_TURN', '当前还未轮到该席位。');
    if (input.revision !== state.expectedRevision || input.turnId !== state.turnId) fail(409, 'STALE_TURN', '轮次或版本已变化，请读取当前状态再提交。');
    if (!input.payload || typeof input.payload !== 'object' || ((input.payload as { speaker?: unknown }).speaker !== undefined && (input.payload as { speaker?: unknown }).speaker !== r)) fail(403, 'ROLE_SCOPE', '席位令牌不能冒充其他角色。');
    const suppliedText = (input.payload as { text?: unknown }).text;
    if (game.jurors && typeof suppliedText === 'string' && [...suppliedText.trim()].length > EXTERNAL_TURN_LIMIT) {
      fail(400, 'TURN_TOO_LONG', `本轮台词最多 ${EXTERNAL_TURN_LIMIT} 个字符。请缩短台词后重新提交，本轮尚未入卷。`);
    }
    this.acceptTurn(game, { ...(input.payload as object), speaker: r });
    game.actions[action.key] = { fingerprint: action.fingerprint, result: { acceptedTurnId: input.turnId } }; await this.save(game);
    return this.state(game, rawToken);
  }
  private async prepareVerdicts(rawToken: string, input: PrepareVerdictsInput): Promise<AgentState> {
    const stored = await this.require(); const r = this.auth(stored, rawToken);
    const game = copy(stored); const action = this.dedup(game, hash(rawToken), input, 'verdicts');
    if (action.existing) return this.state(stored, rawToken);
    if (r !== 'judge') fail(403, 'ROLE_SCOPE', '只有法官席可以准备判词。');
    if (game.postJury) fail(409, 'POST_JURY_VERDICT', '请等待陪审票决，再于第 11 轮公开宣判。');
    if (game.prepared) fail(409, 'ALREADY_PREPARED', '条件判词已经封存。');
    if (input.revision !== undefined && input.revision !== this.actionRevision(game)) fail(409, 'STALE_TURN', '版本已变化，请先读取当前状态。');
    this.prepare(game, input.plaintiff, input.defendant, 'external'); this.settle(game);
    game.actions[action.key] = { fingerprint: action.fingerprint, result: { prepared: true } }; await this.save(game); return this.state(game, rawToken);
  }
  private async seatJury(visitorId: string): Promise<PublicGame> {
    const stored = await this.require();
    if (!stored.jurors) return fail(409, 'JURY_UNAVAILABLE', '本案无需领取陪审席。');
    if (stored.jurors.includes(visitorId)) return this.public(stored);
    if (stored.party) return fail(403, 'JURY_SEAT_REQUIRED', '陪审席留给开庭的玩家，旁听请坐台下。');
    if (!stored.session.pendingTurns.length || stored.outcome !== 'pending') return fail(409, 'JURY_SEATING_CLOSED', '已经封卷，入席得等下一场。');
    const game = copy(stored);
    game.jurors = [...stored.jurors, visitorId];
    const opensCourt = !this.canRun(stored) && this.canRun(game);
    this.change(game, !opensCourt);
    if (opensCourt) this.pump(game);
    await this.save(game);
    return this.public(game);
  }
  private async respond(visitorId: string, input: { ticket?: unknown; stance?: unknown; useAgent?: unknown }): Promise<PublicGame> {
    const stored = await this.require();
    const party = stored.party;
    if (party?.defendant !== 'friend' || !party.defenseTicketHash
      || typeof input.ticket !== 'string' || input.ticket.length > 200 || hash(input.ticket) !== party.defenseTicketHash) {
      return fail(404, 'NOT_FOUND', '找不到这张答辩邀请。');
    }
    const jurors = stored.jurors!;
    if (jurors[0] === visitorId) return fail(403, 'FRIEND_REQUIRED', '这张答辩邀请留给你的好友。');
    const useAgent = input.useAgent === true;
    if ((input.useAgent !== undefined && typeof input.useAgent !== 'boolean') || (useAgent && input.stance !== undefined)) {
      return fail(400, 'INVALID_INPUT', '填一句答辩，或请自己的 Agent 出庭。');
    }
    const stance = useAgent ? undefined : text(input.stance, '答辩立场', POSITION_LIMIT);
    if (jurors.length > 1) {
      if (jurors[1] === visitorId && (useAgent ? stored.seats.defendant.source === 'external' : party.defense === stance)) return this.public(stored);
      return fail(409, 'DEFENSE_SEAT_TAKEN', '答辩席已经有人坐了。');
    }
    if (!stored.session.pendingTurns.length || stored.outcome !== 'pending') return fail(409, 'JURY_SEATING_CLOSED', '这间法庭已经散场。');
    const game = copy(stored);
    game.jurors!.push(visitorId);
    if (useAgent) {
      game.seats.defendant = { role: 'defendant', source: 'external', status: 'reserved', ticket: input.ticket };
    } else {
      game.seats.defendant = { role: 'defendant', source: 'builtin', status: 'builtin' };
      game.party!.defense = stance;
    }
    this.change(game);
    await this.save(game);
    return this.public(game);
  }
  private async react(visitorId: string, input: { kind?: unknown; prop?: unknown; text?: unknown; clientActionId?: unknown }): Promise<PublicGame> {
    let reaction: JuryReactionInput;
    if (input.kind === 'prop' && JURY_PROPS.includes(input.prop as JuryProp)) {
      reaction = { kind: 'prop', prop: input.prop as JuryProp };
    } else if (input.kind === 'message' && typeof input.text === 'string' && input.text.trim() && [...input.text.trim()].length <= 60) {
      reaction = { kind: 'message', text: input.text.trim() };
    } else {
      return fail(400, 'INVALID_REACTION', '请选择有效道具，或发送 1 到 60 个字符的留言。');
    }
    const actionId = text(input.clientActionId, '操作编号');
    const fingerprint = hash(JSON.stringify(reaction));
    const key = `reactions:${visitorId}`;
    const history = await this.ctx.storage.get<ReactionHistory>(key);
    const stored = await this.require();
    if (!stored.jurors?.includes(visitorId)) return fail(403, 'JURY_SEAT_REQUIRED', '先坐上陪审席。');
    const receipt = history?.receipts.find(item => item.actionId === actionId);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) fail(409, 'ACTION_CONFLICT', '同一操作编号不能提交不同内容。');
      return this.public(stored);
    }
    if (!this.canRun(stored) || !stored.session.pendingTurns.length || stored.outcome !== 'pending') {
      return fail(409, 'REACTION_CLOSED', '开庭后才能扔，封卷就收手。');
    }
    const now = this.now();
    if (history && now - history.lastAt < REACTION_COOLDOWN_MS) return fail(429, 'REACTION_RATE_LIMIT', '请稍等片刻再发送。');
    const game = copy(stored);
    this.change(game, true);
    const id = game.revision;
    const event: JuryReaction = reaction.kind === 'prop'
      ? { ...reaction, id, target: game.session.turns.at(-1)?.speaker ?? 'judge' }
      : { ...reaction, id };
    game.reactions = [...(game.reactions ?? []), event].slice(-RECENT_REACTIONS);
    await this.save(game, { reaction: { key, history: { lastAt: now, receipts: [...(history?.receipts ?? []), { actionId, fingerprint }].slice(-REACTION_RECEIPTS) } } });
    return this.public(game);
  }
  private async vote(visitorId: string, input: { winner: JuryWinner; clientActionId: string }): Promise<PublicGame> {
    const stored = await this.require();
    if (input.winner !== 'plaintiff' && input.winner !== 'defendant') return fail(400, 'INVALID_VOTE', '请选择原告或被告。');
    const game = copy(stored); const action = this.dedup(game, visitorId, input, 'vote');
    if (action.existing) return this.public(stored);
    if (game.votes[visitorId]) fail(409, 'ALREADY_VOTED', '这个浏览器已在本案投过票。');
    if (game.session.status !== 'awaiting-ruling' || game.outcome !== 'pending' || (game.deadlineAt && this.now() >= game.deadlineAt)) return fail(409, 'VOTE_CLOSED', '本案当前不接受陪审票。');
    if (game.party && !game.prepared) return fail(409, 'VOTE_CLOSED', '等法官把卷宗封好，再投票。');
    if (game.jurors && !game.jurors.includes(visitorId)) return fail(403, 'JURY_SEAT_REQUIRED', '这一轮由已入席的陪审员投票。');
    game.votes[visitorId] = input.winner; this.change(game); this.settle(game);
    game.actions[action.key] = { fingerprint: action.fingerprint, result: { voted: true } }; await this.save(game); return this.public(game);
  }
  private async admin(input: { op: string } | undefined): Promise<Response> {
    if (!input || typeof input.op !== 'string') return fail(400, 'INVALID_INPUT', '未知管理操作。');
    const stored = await this.load();
    if (input.op === 'purge') {
      await this.ctx.storage.deleteAll();
      this.game = undefined; this.projectedKey = undefined;
      try { await this.env.DB?.prepare('DELETE FROM games WHERE id = ?').bind(stored?.id ?? '').run(); } catch (error) { console.error('court D1 purge failed', error); }
      return json({ purged: true });
    }
    const game = stored || fail(404, 'NOT_FOUND', '找不到这间法庭。');
    if (input.op === 'detail') {
      const seats = Object.fromEntries(ROLES.map(r => { const seat = game.seats[r]; return [r, { ...seat, tokenHash: undefined, claim: seat.claim ? { actionId: seat.claim.actionId, agentName: seat.agentName } : undefined, ticket: seat.ticket ? '已签发' : undefined }]; }));
      return json({ game: this.public(game), internal: { hidden: !!game.hidden, seats, votes: game.votes, ownerHash: game.ownerHash,
        prepared: game.prepared ? { plaintiff: game.prepared.plaintiff, defendant: game.prepared.defendant, preparedAt: game.prepared.preparedAt, source: game.prepared.source, publishedAt: game.prepared.publishedAt } : null } });
    }
    const next = copy(game);
    if (input.op === 'close-votes') {
      next.deadlineAt = this.now(); this.settle(next);
      if (next.revision === game.revision) this.change(next);
      await this.save(next); return json({ game: this.public(next) });
    }
    if (input.op === 'void') {
      next.hidden = true;
      if (next.session.status !== 'completed' && (next.outcome === 'pending' || next.postJury)) { next.outcome = 'unresolved'; }
      this.change(next); await this.save(next); return json({ game: this.public(next) });
    }
    if (input.op === 'unvoid') { next.hidden = false; this.change(next); await this.save(next); return json({ game: this.public(next) }); }
    if (input.op === 'revoke-tickets') {
      let revoked = 0;
      for (const r of ROLES) { const seat = next.seats[r]; if (seat.ticket && !seat.claim) { seat.ticket = undefined; if (seat.status === 'reserved') seat.status = 'open'; revoked++; } }
      if (revoked) this.change(next); await this.save(next); return json({ revoked });
    }
    if (input.op === 'resync') { this.projectedKey = undefined; await this.save(next); return json({ game: this.public(next) }); }
    return fail(400, 'INVALID_INPUT', '未知管理操作。');
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const gameId = decodeURIComponent(path.split('/')[1] || '');
      const method = request.method;
      if (path === '/create' && method === 'POST') {
        const body = await readJson(request);
        return json(await this.mutate(() => this.create(body.input, body.gameId, body.visitorId)));
      }
      const browserRoute = gameId ? path.slice(gameId.length + 1) : undefined;
      const browserGame = method === 'GET' && browserRoute !== undefined && BROWSER_ROOM_READS.has(browserRoute)
        ? await this.browserRoom(request) : undefined;
      if (browserGame && path === `/${gameId}` && method === 'GET') return json(this.public(browserGame));
      if (gameId && path === `/${gameId}/jury-seat` && method === 'GET') {
        const visitorId = request.headers.get('x-court-visitor-id');
        const seated = Boolean(visitorId && browserGame?.jurors?.includes(visitorId));
        const vote = browserGame?.party && seated && visitorId ? browserGame.votes[visitorId] : undefined;
        return json({ seated, ...(vote && { vote }) });
      }
      if (method === 'POST' && browserRoute && BROWSER_ROOM_MUTATIONS.has(browserRoute)) {
        const body = await readJson(request);
        return json(await this.mutate(async () => {
          await this.browserRoom(request);
          if (browserRoute === '/invite') return this.invite(gameId, body);
          const visitorId = text(body.visitorId, '访客凭证', 200);
          switch (browserRoute) {
            case '/respond': return this.respond(visitorId, body);
            case '/jury-seat': return this.seatJury(visitorId);
            case '/reactions': return this.react(visitorId, body);
            case '/votes': return this.vote(visitorId, body);
            default: return fail(404, 'NOT_FOUND', '不存在的法庭接口。');
          }
        }));
      }
      if (gameId && path === `/${gameId}/events` && method === 'GET') return await this.events(request, url);
      if (gameId && path === `/${gameId}/wait` && method === 'GET') {
        const result = await this.waitFor(request, null, Number(url.searchParams.get('after') || 0), timeout(url));
        return json(result);
      }
      if (gameId && path === `/${gameId}/admin` && method === 'POST') {
        if (request.headers.get('x-court-admin') !== '1') return fail(403, 'AUTH', '需要管理员通道。');
        const body = await readJson(request);
        return await this.mutate(() => this.admin(body));
      }
      const ticketRoute = path.match(/^\/([^/]+)\/ticket\/([^/]+)(\/(?:claim|context))?$/);
      if (ticketRoute) {
        const secret = decodeURIComponent(ticketRoute[2]);
        if (!ticketRoute[3] && method === 'GET') return json(await this.inspect(decodeURIComponent(ticketRoute[1]), secret));
        if (ticketRoute[3] === '/context' && method === 'GET') return json(await this.context(decodeURIComponent(ticketRoute[1]), secret));
        if (ticketRoute[3] === '/claim' && method === 'POST') {
          const body = await readJson(request);
          return json(await this.mutate(() => this.join(secret, body)));
        }
      }
      const seatRoute = path.match(/^\/([^/]+)\/seat(\/(?:wait|turns|verdicts))?$/);
      if (seatRoute) {
        const token = bearer(request);
        if (!seatRoute[2] && method === 'GET') { const game = await this.require(); return json(this.state(game, token)); }
        if (seatRoute[2] === '/wait' && method === 'GET') {
          const result = await this.waitFor(request, token, Number(url.searchParams.get('after') || 0), timeout(url));
          return json(result);
        }
        if (seatRoute[2] === '/turns' && method === 'POST') {
          const body = await readJson(request);
          return json(await this.mutate(() => this.speak(token, body)));
        }
        if (seatRoute[2] === '/verdicts' && method === 'POST') {
          const input = await readJson(request);
          return json(await this.mutate(() => this.prepareVerdicts(token, { ...input, plaintiff: { ...(input.plaintiff as object ?? {}), speaker: 'judge' }, defendant: { ...(input.defendant as object ?? {}), speaker: 'judge' } })));
        }
      }
      return fail(404, 'NOT_FOUND', '不存在的法庭接口。');
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.code, message: error.message }, error.status);
      if (error instanceof CourtRuntimeError) return json({ error: error.code, message: error.message }, error.code === 'INVALID_STATE' ? 409 : 400);
      console.error('court room error', error);
      return json({ error: 'INTERNAL', message: '庭审服务发生错误，操作未确认。请先查询状态。' }, 500);
    }
  }
  private async events(request: Request, url: URL): Promise<Response> {
    const game = await this.require();
    const after = Number(url.searchParams.get('after') || 0);
    if (!Number.isSafeInteger(after) || after < 0) return fail(400, 'INVALID_INPUT', '版本号无效。');
    if (this.subscriptions.size + this.waiters.size >= MAX_STREAMS) return fail(429, 'BUSY', '等待连接过多。');
    const encoder = new TextEncoder();
    const pair = new TransformStream();
    const writer = pair.writable.getWriter();
    let pending = 0; let closed = false;
    const frame = (chunk: string) => { if (closed) return; pending++; void writer.write(encoder.encode(chunk)).catch(() => {}).finally(() => { pending--; }); if (pending > 16) close(); };
    const close = () => { if (closed) return; closed = true; cleanup(); void writer.close().catch(() => {}); };
    const subscription: Subscription = {
      revision: Math.max(game.revision, after),
      send: value => frame(`id: ${value.revision}\nevent: game\ndata: ${JSON.stringify(value)}\n\n`),
      close,
    };
    const heartbeat = setInterval(() => { if (pending === 0) frame(': heartbeat\n\n'); }, 25_000);
    const cleanup = () => { clearInterval(heartbeat); this.subscriptions.delete(subscription); request.signal.removeEventListener('abort', close); };
    this.subscriptions.add(subscription);
    request.signal.addEventListener('abort', close, { once: true });
    // Headers first, then the current snapshot if the client is behind.
    const stream = new Response(pair.readable, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no', 'x-content-type-options': 'nosniff' } });
    if (game.revision > after) subscription.send(this.public(game));
    return stream;
  }
  /** Longpoll shared by public and seat waits; resolves on revision change, timeout or abort. */
  private async waitFor(request: Request, token: string | null, after: number, ms: number): Promise<AgentState | PublicGame> {
    const game = await this.require();
    const snapshot = token ? this.state(game, token) : null;
    if (!Number.isSafeInteger(after) || after < 0) return fail(400, 'INVALID_INPUT', '版本号无效。');
    if (request.signal.aborted) return fail(499, 'DISCONNECTED', '连接已断开。');
    const ahead = (snapshot ? snapshot.expectedRevision : game.revision) > after;
    if (ahead || (snapshot ? snapshot.roleFinished : false) || ms === 0) return snapshot ?? this.public(game);
    if (this.waiters.size + this.subscriptions.size >= MAX_STREAMS) return fail(429, 'BUSY', '等待连接过多。');
    return await new Promise((resolveWait, reject) => {
      const cleanup = () => { clearTimeout(waiter.timer); this.waiters.delete(waiter); request.signal.removeEventListener('abort', aborted); };
      const aborted = () => { cleanup(); reject(new HttpError(499, 'DISCONNECTED', '连接已断开。')); };
      const waiter: Waiter = { revision: after, token, resolve: resolveWait, reject, cleanup,
        timer: setTimeout(() => { cleanup(); const fresh = this.game ?? game; resolveWait(token ? this.state(fresh, token) : this.public(fresh)); }, ms) };
      this.waiters.add(waiter);
      request.signal.addEventListener('abort', aborted, { once: true });
    });
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
async function readJson(request: Request): Promise<any> {
  let parsed: unknown;
  try { parsed = await request.json(); } catch { return fail(400, 'INVALID_JSON', '请求必须是 JSON 对象。'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail(400, 'INVALID_JSON', '请求必须是 JSON 对象。');
  return parsed;
}
function bearer(request: Request): string {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return fail(401, 'AUTH', '需要席位 Bearer token。');
  return auth.slice(7);
}
function timeout(url: URL): number {
  const seconds = Math.max(0, Math.min(Number(url.searchParams.get('timeout') ?? 15), 20));
  return Number.isFinite(seconds) ? seconds * 1000 : 15_000;
}
