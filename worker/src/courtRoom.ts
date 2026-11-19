import { applyExternalCourtRuling, applyExternalCourtTurn, castJuryVote, createCourtSession, rehearsalTurn, validateCourtSession } from '../../src/utils/courtRuntime';
import { toGameCard, gameCardSearchBlob } from '../../src/utils/gameCard';
import type { CourtRole, CourtSession } from '../../src/types';
import type { AgentState, CreateGameInput, CreateGameResult, GameInvitation, InvitationContext, JuryWinner, PrepareVerdictsInput, PublicGame, PublicSeat } from '../../src/types/platform';
import type { Env } from './env';
import { fail, HttpError, scopedToken } from './env';
import { ensureSchema } from './d1';
import { sha256 } from './sha256';

const ROLES: CourtRole[] = ['judge', 'plaintiff', 'defendant'];
const DAY = 24 * 60 * 60 * 1000;
const copy = <T,>(x: T): T => structuredClone(x);
const hash = (value: string) => sha256(value);
function text(value: unknown, label: string, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) return fail(400, 'INVALID_INPUT', `${label}无效。`);
  return value.trim();
}
function role(value: unknown): CourtRole { return ROLES.includes(value as CourtRole) ? value as CourtRole : fail(400, 'INVALID_ROLE', '只有法官、原告、被告三个 Agent 席位。'); }

interface Seat extends PublicSeat { tokenHash?: string; ticket?: string; claim?: { actionId: string; fingerprint: string; seatToken: string } }
interface Prepared { plaintiff: unknown; defendant: unknown; preparedAt: number; source: 'external' | 'practice'; publishedAt?: number }
interface InternalGame {
  id: string; mode: 'practice' | 'multiplayer'; revision: number; createdAt: number; updatedAt: number;
  session: CourtSession; seats: Record<CourtRole, Seat>; ownerHash: string; hidden?: boolean;
  votes: Record<string, JuryWinner>; deadlineAt?: number; outcome: 'pending' | JuryWinner | 'unresolved'; prepared?: Prepared;
  actions: Record<string, { fingerprint: string; result: unknown }>;
}
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
  readonly now = () => Date.now();
  constructor(private ctx: { storage: DurableObjectStorage }, private env: Env) {}

  private async load(): Promise<InternalGame | undefined> {
    if (this.game) return this.game;
    const stored = await this.ctx.storage.get<InternalGame>('game');
    if (stored) { stored.session = validateCourtSession(stored.session); this.game = stored; }
    return this.game;
  }
  private async require(): Promise<InternalGame> { return await this.load() || fail(404, 'NOT_FOUND', '找不到这间法庭。'); }
  private auth(game: InternalGame, rawToken: string): CourtRole {
    if (typeof rawToken !== 'string' || rawToken.length > 200) return fail(401, 'AUTH', '需要有效的席位令牌。');
    const digest = hash(rawToken);
    for (const r of ROLES) if (game.seats[r].tokenHash === digest) return r;
    return fail(401, 'AUTH', '席位令牌无效。');
  }
  private canRun(game: InternalGame) { return ROLES.every(r => game.seats[r].source === 'practice' || game.seats[r].status === 'claimed'); }
  private public(game: InternalGame): PublicGame {
    const current = game.session.pendingTurns[0];
    const running = this.canRun(game);
    const count = (winner: JuryWinner) => Object.values(game.votes).filter(v => v === winner).length;
    const p = count('plaintiff'), d = count('defendant');
    return copy({ id: game.id, mode: game.mode, revision: game.revision, createdAt: game.createdAt, updatedAt: game.updatedAt,
      status: game.session.status === 'completed' ? 'completed' : game.outcome === 'unresolved' ? 'unresolved' : !running ? 'waiting-agents' : current ? 'running' : 'waiting-jury',
      session: game.session,
      seats: Object.fromEntries(ROLES.map(r => { const { role: seatRole, source, status, agentName } = game.seats[r]; return [r, { role: seatRole, source, status, ...(agentName ? {agentName} : {}) }]; })) as Record<CourtRole, PublicSeat>,
      currentRole: running && current ? current.role : null,
      currentTurnId: running && current ? `${game.session.id}-turn-${game.session.turns.length + 1}` : null,
      guidePath: '/agents/guide.md',
      jury: { plaintiffVotes: p, defendantVotes: d, total: p + d, minimumVotes: game.mode === 'practice' ? 1 : 3, ...(game.deadlineAt ? {deadlineAt: game.deadlineAt} : {}), outcome: game.outcome },
      verdict: { prepared: !!game.prepared, ...(game.prepared ? {preparedAt: game.prepared.preparedAt, source: game.prepared.source, ...(game.prepared.publishedAt ? {publishedAt: game.prepared.publishedAt} : {})} : {}) },
    });
  }
  private seatTicket(game: InternalGame, secret: string): { seat: Seat; role: CourtRole } {
    const full = `${game.id}.${secret}`;
    for (const r of ROLES) if (game.seats[r].ticket === full) return { seat: game.seats[r], role: r };
    return fail(404, 'NOT_FOUND', '邀请不存在。');
  }
  /** Commit the mutated copy, persist it, notify streams and project the D1 card. */
  private async save(game: InternalGame, creation?: CreateReceipt) {
    await this.ctx.storage.put('game', game);
    if (creation) await this.ctx.storage.put('create', creation);
    this.game = game;
    for (const subscription of [...this.subscriptions]) if (game.revision > subscription.revision) {
      subscription.revision = game.revision;
      try { subscription.send(this.public(game)); } catch { this.subscriptions.delete(subscription); subscription.close(); }
    }
    for (const waiter of [...this.waiters]) if (game.revision > waiter.revision) {
      waiter.cleanup(); waiter.resolve(waiter.token ? this.state(game, waiter.token) : this.public(game));
    }
    await this.project(game);
    await this.schedule(game);
  }
  private change(game: InternalGame) { game.revision++; game.updatedAt = this.now(); }
  private seal(game: InternalGame) { if (!game.session.pendingTurns.length && !game.deadlineAt) game.deadlineAt = this.now() + DAY; }
  private pump(game: InternalGame) {
    if (!this.canRun(game)) return;
    while (game.session.pendingTurns.length) {
      const step = game.session.pendingTurns[0];
      if (game.seats[step.role].source !== 'practice') break;
      game.session = applyExternalCourtTurn(game.session, rehearsalTurn(game.session, step));
      this.change(game);
    }
    this.seal(game);
    if (!game.session.pendingTurns.length && game.seats.judge.source === 'practice' && !game.prepared) {
      const make = (winner: JuryWinner) => { const fork = castJuryVote(game.session, winner); return rehearsalTurn(fork, { role: 'judge', phase: 'verdict', interventionIds: [] }); };
      this.prepare(game, make('plaintiff'), make('defendant'), 'practice');
    }
    this.settle(game);
  }
  private prepare(game: InternalGame, plaintiff: unknown, defendant: unknown, source: 'external' | 'practice') {
    if (game.session.pendingTurns.length || game.session.status !== 'awaiting-ruling') fail(409, 'NOT_SEALED', '十轮交锋结束后才能准备条件判词。');
    for (const [winner, payload] of [['plaintiff', plaintiff], ['defendant', defendant]] as const) applyExternalCourtRuling(castJuryVote(game.session, winner), payload);
    game.prepared = { plaintiff: copy(plaintiff), defendant: copy(defendant), preparedAt: this.now(), source };
    this.change(game);
  }
  private settle(game: InternalGame) {
    if (game.session.pendingTurns.length || game.session.status === 'completed') return;
    const p = Object.values(game.votes).filter(v => v === 'plaintiff').length;
    const d = Object.values(game.votes).filter(v => v === 'defendant').length;
    const enough = p + d >= (game.mode === 'practice' ? 1 : 3);
    let next = game.outcome;
    if (next === 'pending' && enough && p !== d) next = p > d ? 'plaintiff' : 'defendant';
    if (next === 'pending' && game.deadlineAt && this.now() >= game.deadlineAt) next = 'unresolved';
    if (next !== game.outcome) { game.outcome = next; this.change(game); }
    if ((next === 'plaintiff' || next === 'defendant') && game.prepared) {
      game.session = applyExternalCourtRuling(castJuryVote(game.session, next), game.prepared[next]);
      game.prepared.publishedAt = this.now(); this.change(game);
    }
  }
  private invitation(game: InternalGame, r: CourtRole): GameInvitation {
    const seat = game.seats[r];
    if (seat.source === 'practice' || seat.status === 'claimed') return fail(409, 'SEAT_UNAVAILABLE', '该席位不能领取入场邀请。');
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
    const finished = game.session.status === 'completed' || (r === 'judge' ? !!game.prepared : noMoreTurns);
    const canSubmit = !finished && pub.currentRole === r;
    const prepare = !finished && r === 'judge' && game.session.status === 'awaiting-ruling';
    return { game: pub, role: r, roleFinished: finished, canSubmit, turnId: canSubmit ? pub.currentTurnId : null, expectedRevision: game.revision,
      action: finished ? 'finished' : prepare ? 'prepare_verdicts' : canSubmit ? 'submit_turn' : 'wait', guidePath: '/agents/guide.md', rolePromptPath: `/agents/roles/${r}.md`,
      receipts: Object.entries(game.actions).filter(([key]) => key.startsWith(`${hash(rawToken)}:`)).map(([key, value]) => ({ clientActionId: key.slice(65), kind: JSON.parse(value.fingerprint).kind, ...(value.result as object) })) };
  }

  private async project(game: InternalGame) {
    if (!this.env.DB) return;
    // The card only changes on transitions, not on every turn, keeping D1 writes bounded.
    const seatsSig = ROLES.map(r => `${r}:${game.seats[r].status}`).join(',');
    const key = [game.mode, game.hidden ? 1 : 0, game.session.status, game.outcome, seatsSig, game.prepared ? (game.prepared.publishedAt ? 2 : 1) : 0].join('|');
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
  private async schedule(game: InternalGame) {
    const terminal = game.session.status === 'completed' || game.outcome === 'unresolved';
    const target = !terminal && game.deadlineAt ? game.deadlineAt : null;
    const current = await this.ctx.storage.getAlarm();
    if (target === null) { if (current !== null) await this.ctx.storage.deleteAlarm(); return; }
    if (current === null || current > target) await this.ctx.storage.setAlarm(target);
  }
  async alarm() {
    const game = await this.load(); if (!game) return;
    const next = copy(game); const before = next.revision; this.settle(next);
    if (next.revision !== before) await this.save(next);
  }

  private async create(input: CreateGameInput, gameId: string): Promise<CreateGameResult> {
    const r = role(input.role);
    const fingerprint = JSON.stringify(input);
    const prior = await this.ctx.storage.get<CreateReceipt>('create');
    if (this.game || prior) {
      if (!prior || prior.fingerprint !== fingerprint) return fail(409, 'ACTION_CONFLICT', '该创建编号已被其他内容使用。');
      return { ...copy(prior.result), game: this.public(await this.require()) };
    }
    if (input.mode !== undefined && input.mode !== 'practice' && input.mode !== 'multiplayer') return fail(400, 'INVALID_MODE', '未知游戏模式。');
    const mode = input.mode || 'practice';
    // Replay the empty session through the public validator to strip scripts, credentials and unknown fields.
    const session = validateCourtSession(createCourtSession(input.caseData, 'external'));
    const ownerToken = scopedToken(gameId); const time = this.now();
    const game: InternalGame = { id: gameId, mode, revision: 1, createdAt: time, updatedAt: time, session,
      seats: Object.fromEntries(ROLES.map(x => [x, { role: x, source: mode === 'multiplayer' || x === r ? 'external' : 'practice', status: mode === 'multiplayer' || x === r ? 'open' : 'practice' }])) as Record<CourtRole, Seat>,
      ownerHash: hash(ownerToken), votes: {}, outcome: 'pending', actions: {} };
    const invitation = this.invitation(game, r);
    const result: CreateGameResult = { game: this.public(game), ownerToken, invitation };
    await this.save(game, { fingerprint, result });
    return result;
  }
  private async invite(id: string, input: { role: CourtRole; ownerToken?: string }): Promise<GameInvitation> {
    const stored = await this.require();
    if (stored.id !== id) return fail(404, 'NOT_FOUND', '找不到这间法庭。');
    const game = copy(stored); const r = role(input.role);
    if (game.mode !== 'multiplayer' && (!input.ownerToken || hash(input.ownerToken) !== game.ownerHash)) return fail(403, 'OWNER_REQUIRED', '只有创建者可以取回排练入场邀请。');
    const invitation = this.invitation(game, r); await this.save(game); return invitation;
  }
  private async inspect(gameId: string, secret: string) {
    const game = await this.require();
    const { role: r } = this.seatTicket(game, secret);
    return { gameId: game.id, role: r, claimed: !!game.seats[r].claim, game: this.public(game), guidePath: '/agents/guide.md', rolePromptPath: `/agents/roles/${r}.md` };
  }
  private async context(gameId: string, secret: string): Promise<InvitationContext> {
    const info = await this.inspect(gameId, secret);
    const game = await this.require();
    const claim = game.seats[info.role].claim;
    return claim ? this.state(game, claim.seatToken) : {
      game: info.game, gameId: info.gameId, role: info.role, claimed: false, action: 'claim',
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
    if (input.revision !== game.revision || input.turnId !== state.turnId) fail(409, 'STALE_TURN', '轮次或版本已变化，请读取当前状态再提交。');
    if (!input.payload || typeof input.payload !== 'object' || ((input.payload as { speaker?: unknown }).speaker !== undefined && (input.payload as { speaker?: unknown }).speaker !== r)) fail(403, 'ROLE_SCOPE', '席位令牌不能冒充其他角色。');
    game.session = applyExternalCourtTurn(game.session, { ...(input.payload as object), speaker: r });
    this.change(game); this.pump(game);
    game.actions[action.key] = { fingerprint: action.fingerprint, result: { acceptedTurnId: input.turnId } }; await this.save(game);
    return this.state(game, rawToken);
  }
  private async prepareVerdicts(rawToken: string, input: PrepareVerdictsInput): Promise<AgentState> {
    const stored = await this.require(); const r = this.auth(stored, rawToken);
    const game = copy(stored); const action = this.dedup(game, hash(rawToken), input, 'verdicts');
    if (action.existing) return this.state(stored, rawToken);
    if (r !== 'judge') fail(403, 'ROLE_SCOPE', '只有法官席可以准备判词。');
    if (game.prepared) fail(409, 'ALREADY_PREPARED', '条件判词已经封存。');
    if (input.revision !== undefined && input.revision !== game.revision) fail(409, 'STALE_TURN', '版本已变化，请先读取当前状态。');
    this.prepare(game, input.plaintiff, input.defendant, 'external'); this.settle(game);
    game.actions[action.key] = { fingerprint: action.fingerprint, result: { prepared: true } }; await this.save(game); return this.state(game, rawToken);
  }
  private async vote(visitorId: string, input: { winner: JuryWinner; clientActionId: string }): Promise<PublicGame> {
    const stored = await this.require();
    if (input.winner !== 'plaintiff' && input.winner !== 'defendant') return fail(400, 'INVALID_VOTE', '请选择原告或被告。');
    const game = copy(stored); const action = this.dedup(game, visitorId, input, 'vote');
    if (action.existing) return this.public(stored);
    if (game.votes[visitorId]) fail(409, 'ALREADY_VOTED', '这个浏览器已在本案投过票。');
    if (game.session.status !== 'awaiting-ruling' || game.outcome !== 'pending' || (game.deadlineAt && this.now() >= game.deadlineAt)) return fail(409, 'VOTE_CLOSED', '本案当前不接受陪审票。');
    game.votes[visitorId] = input.winner; this.change(game); this.settle(game);
    game.actions[action.key] = { fingerprint: action.fingerprint, result: { voted: true } }; await this.save(game); return this.public(game);
  }
  private async admin(request: Request): Promise<Response> {
    if (request.headers.get('x-court-admin') !== '1') return fail(403, 'AUTH', '需要管理员通道。');
    const stored = await this.load();
    const input = await request.json() as { op: string } | undefined;
    if (!input || typeof input.op !== 'string') return fail(400, 'INVALID_INPUT', '未知管理操作。');
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
      if (next.session.status !== 'completed' && next.outcome === 'pending') { next.outcome = 'unresolved'; }
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
      if (path === '/create' && method === 'POST') { const body = await readJson(request); return json(await this.create(body.input, body.gameId)); }
      if (gameId && path === `/${gameId}` && method === 'GET') return json(this.public(await this.require()));
      if (gameId && path === `/${gameId}/invite` && method === 'POST') return json(await this.invite(gameId, await readJson(request)));
      if (gameId && path === `/${gameId}/votes` && method === 'POST') { const body = await readJson(request); return json(await this.vote(text(body.visitorId, '访客凭证', 200), body)); }
      if (gameId && path === `/${gameId}/events` && method === 'GET') return await this.events(request, url);
      if (gameId && path === `/${gameId}/wait` && method === 'GET') {
        const result = await this.waitFor(request, null, Number(url.searchParams.get('after') || 0), timeout(url));
        return json(result);
      }
      if (gameId && path === `/${gameId}/admin` && method === 'POST') return await this.admin(request);
      const ticketRoute = path.match(/^\/([^/]+)\/ticket\/([^/]+)(\/(?:claim|context))?$/);
      if (ticketRoute) {
        const secret = decodeURIComponent(ticketRoute[2]);
        if (!ticketRoute[3] && method === 'GET') return json(await this.inspect(decodeURIComponent(ticketRoute[1]), secret));
        if (ticketRoute[3] === '/context' && method === 'GET') return json(await this.context(decodeURIComponent(ticketRoute[1]), secret));
        if (ticketRoute[3] === '/claim' && method === 'POST') return json(await this.join(secret, await readJson(request)));
      }
      const seatRoute = path.match(/^\/([^/]+)\/seat(\/(?:wait|turns|verdicts))?$/);
      if (seatRoute) {
        const token = bearer(request);
        if (!seatRoute[2] && method === 'GET') { const game = await this.require(); return json(this.state(game, token)); }
        if (seatRoute[2] === '/wait' && method === 'GET') {
          const result = await this.waitFor(request, token, Number(url.searchParams.get('after') || 0), timeout(url));
          return json(result);
        }
        if (seatRoute[2] === '/turns' && method === 'POST') return json(await this.speak(token, await readJson(request)));
        if (seatRoute[2] === '/verdicts' && method === 'POST') {
          const input = await readJson(request);
          return json(await this.prepareVerdicts(token, { ...input, plaintiff: { ...(input.plaintiff as object ?? {}), speaker: 'judge' }, defendant: { ...(input.defendant as object ?? {}), speaker: 'judge' } }));
        }
      }
      return fail(404, 'NOT_FOUND', '不存在的法庭接口。');
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.code, message: error.message }, error.status);
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
