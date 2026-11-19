import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { applyExternalCourtRuling, applyExternalCourtTurn, castJuryVote, createCourtSession, rehearsalTurn, validateCourtSession } from '../src/utils/courtRuntime';
import { toGameCard } from '../src/utils/gameCard';
import type { CourtRole, CourtSession } from '../src/types';
import type { AgentState, AgentTurnInput, CreateGameInput, CreateGameResult, GameCard, GameInvitation, JuryWinner, PrepareVerdictsInput, PublicGame, PublicSeat, JudgmentPage, InvitationContext } from '../src/types/platform';

const ROLES: CourtRole[] = ['judge', 'plaintiff', 'defendant'];
const DAY = 24 * 60 * 60 * 1000;
const copy = <T,>(x: T): T => structuredClone(x);
const token = () => randomBytes(24).toString('base64url');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export class CourtServiceError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'CourtServiceError'; }
}
const fail = (status: number, code: string, message: string): never => { throw new CourtServiceError(status, code, message); };
function text(value: unknown, label: string, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) return fail(400, 'INVALID_INPUT', `${label}无效。`);
  return value.trim();
}
function role(value: unknown): CourtRole { return ROLES.includes(value as CourtRole) ? value as CourtRole : fail(400, 'INVALID_ROLE', '只有法官、原告、被告三个 Agent 席位。'); }
interface Seat extends PublicSeat { tokenHash?: string; ticket?: string }
interface Ticket { gameId: string; role: CourtRole; claimed?: { actionId: string; fingerprint: string; seatToken: string } }
interface Prepared { plaintiff: unknown; defendant: unknown; preparedAt: number; source: 'external' | 'practice'; publishedAt?: number }
interface InternalGame {
  id: string; mode: 'practice' | 'multiplayer'; revision: number; createdAt: number; updatedAt: number;
  session: CourtSession; seats: Record<CourtRole, Seat>; ownerHash: string;
  votes: Record<string, JuryWinner>; deadlineAt?: number; outcome: 'pending' | JuryWinner | 'unresolved'; prepared?: Prepared;
  actions: Record<string, { fingerprint: string; result: unknown }>;
}
interface Visitor { csrf: string; createdAt: number }
interface PublicSubscription { gameId: string; revision: number; send: (game: PublicGame) => void; close: () => void }
interface Waiter { gameId: string; revision: number; resolve: (state: AgentState) => void; reject: (error: Error) => void; token: string; timer: ReturnType<typeof setTimeout>; cleanup: () => void }

/** The sole owner of live sessions. All accepted changes commit synchronously before acknowledgement. */
export class CourtService {
  private db: DatabaseSync;
  private games = new Map<string, InternalGame>();
  private tickets = new Map<string, Ticket>();
  private visitors = new Map<string, Visitor>();
  private creations = new Map<string, {fingerprint: string; result: CreateGameResult}>();
  private waiters = new Set<Waiter>();
  private subscriptions = new Set<PublicSubscription>();
  private timer?: ReturnType<typeof setInterval>;
  private closed = false;
  readonly now: () => number;
  constructor(options: { storePath?: string; now?: () => number; autoTick?: boolean } = {}) {
    this.now = options.now || Date.now;
    const path = options.storePath || resolve('data/court.sqlite');
    if (path !== ':memory:') { mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); }
    this.db = new DatabaseSync(path);
    try {
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec('PRAGMA locking_mode = EXCLUSIVE; PRAGMA journal_mode = DELETE; PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS public_games (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS private_games (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS invitations (ticket TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS create_receipts (id TEXT PRIMARY KEY, data TEXT NOT NULL);');
    for (const row of this.db.prepare('SELECT id, data FROM private_games').all() as {id: string; data: string}[]) {
      const game = JSON.parse(row.data) as InternalGame;
      game.session = validateCourtSession(game.session);
      this.games.set(row.id, game);
    }
    for (const row of this.db.prepare('SELECT ticket, data FROM invitations').all() as {ticket: string; data: string}[]) this.tickets.set(row.ticket, JSON.parse(row.data));
    for (const row of this.db.prepare('SELECT id, data FROM visitors').all() as {id: string; data: string}[]) this.visitors.set(row.id, JSON.parse(row.data));
    for (const row of this.db.prepare('SELECT id, data FROM create_receipts').all() as {id: string; data: string}[]) this.creations.set(row.id, JSON.parse(row.data));
    this.tick();
    if (options.autoTick !== false) { this.timer = setInterval(() => this.tick(), 1000); this.timer.unref(); }
    } catch (error) { this.db.close(); this.closed = true; throw error; }
  }
  private open() { if (this.closed) fail(503, 'CLOSED', '庭审服务已关闭。'); }
  private game(id: string): InternalGame { this.open(); return this.games.get(id) || fail(404, 'NOT_FOUND', '找不到这间法庭。'); }
  private auth(rawToken: string): { game: InternalGame; role: CourtRole } {
    this.open();
    if (typeof rawToken !== 'string' || rawToken.length > 200) return fail(401, 'AUTH', '需要有效的席位令牌。');
    const digest = hash(rawToken);
    for (const game of this.games.values()) for (const r of ROLES) if (game.seats[r].tokenHash === digest) return { game, role: r };
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
  private save(game: InternalGame, creation?: {key: string; fingerprint: string; result: CreateGameResult}) {
    const publicData = JSON.stringify(this.public(game));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT OR REPLACE INTO private_games VALUES (?, ?)').run(game.id, JSON.stringify(game));
      this.db.prepare('INSERT OR REPLACE INTO public_games VALUES (?, ?)').run(game.id, publicData);
      for (const r of ROLES) { const id = game.seats[r].ticket; if (id) this.db.prepare('INSERT OR REPLACE INTO invitations VALUES (?, ?)').run(id, JSON.stringify(this.tickets.get(id))); }
      if (creation) this.db.prepare('INSERT INTO create_receipts VALUES (?, ?)').run(creation.key,JSON.stringify({fingerprint:creation.fingerprint,result:creation.result}));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    this.games.set(game.id, game);
    if (creation) this.creations.set(creation.key,{fingerprint:creation.fingerprint,result:creation.result});
    for (const subscription of [...this.subscriptions]) if (subscription.gameId === game.id && game.revision > subscription.revision) {
      subscription.revision = game.revision;
      try { subscription.send(this.public(game)); } catch { this.subscriptions.delete(subscription); subscription.close(); }
    }
    for (const waiter of [...this.waiters]) if (waiter.gameId === game.id && game.revision > waiter.revision) {
      waiter.cleanup(); waiter.resolve(this.state(waiter.token));
    }
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
    if (!seat.ticket) { seat.ticket = token(); seat.status = 'reserved'; this.tickets.set(seat.ticket, { gameId: game.id, role: r }); this.change(game); }
    return {ticket: seat.ticket, role: r, path: `/join/${seat.ticket}`};
  }
  create(input: CreateGameInput): CreateGameResult {
    this.open(); const r = role(input.role);
    const createKey = input.clientActionId ? hash(text(input.clientActionId, '创建操作编号')) : undefined;
    const fingerprint = JSON.stringify(input);
    const prior = createKey ? this.creations.get(createKey) : undefined;
    if (prior) { if (prior.fingerprint !== fingerprint) return fail(409,'ACTION_CONFLICT','同一创建操作编号不能提交不同内容。'); return {...copy(prior.result),game:this.get(prior.result.game.id)}; }
    if (input.mode !== undefined && input.mode !== 'practice' && input.mode !== 'multiplayer') return fail(400, 'INVALID_MODE', '未知游戏模式。');
    const mode = input.mode || 'practice';
    // Replay the empty session through the public validator to strip scripts, credentials and unknown fields.
    const session = validateCourtSession(createCourtSession(input.caseData, 'external'));
    const ownerToken = token(); const time = this.now();
    const game: InternalGame = { id: randomBytes(9).toString('base64url'), mode, revision: 1, createdAt: time, updatedAt: time, session,
      seats: Object.fromEntries(ROLES.map(x => [x, {role: x, source: mode === 'multiplayer' || x === r ? 'external' : 'practice', status: mode === 'multiplayer' || x === r ? 'open' : 'practice'}])) as Record<CourtRole, Seat>,
      ownerHash: hash(ownerToken), votes: {}, outcome: 'pending', actions: {}, };
    const invitation = this.invitation(game, r);
    const result = {game: this.public(game), ownerToken, invitation};
    this.save(game,createKey ? {key:createKey,fingerprint,result} : undefined);
    return result;
  }
  list(): GameCard[] { this.open(); return [...this.games.values()].filter(g=>g.mode === 'multiplayer').sort((a,b) => b.createdAt-a.createdAt).slice(0,100).map(g => toGameCard(this.public(g))); }
  judgments(input: {query?: string; cursor?: string; limit?: number} = {}): JudgmentPage {
    this.open();
    if (input.query !== undefined && (typeof input.query !== 'string' || input.query.length > 200)) fail(400, 'INVALID_INPUT', '检索词过长。');
    const query = (input.query || '').trim().toLocaleLowerCase();
    const limit = input.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) fail(400, 'INVALID_INPUT', '每页数量须为 1 到 50。');
    let cursor: {createdAt: number; id: string; query: string} | undefined;
    if (input.cursor) {
      try {
        if (input.cursor.length > 1000 || !/^[A-Za-z0-9_-]+$/.test(input.cursor)) throw new Error();
        const decoded = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'));
        if (!Number.isFinite(decoded.createdAt) || typeof decoded.id !== 'string' || decoded.query !== query) throw new Error();
        cursor = decoded;
      } catch { fail(400, 'INVALID_CURSOR', '分页位置无效，请重新检索。'); }
    }
    const matches = [...this.games.values()].filter(game => game.mode === 'multiplayer' && (game.session.status === 'completed' || game.outcome === 'unresolved'))
      .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
      .filter(game => !cursor || game.createdAt < cursor.createdAt || (game.createdAt === cursor.createdAt && game.id.localeCompare(cursor.id) < 0))
      .map(game => this.public(game)).filter(game => !query || JSON.stringify(game.session).toLocaleLowerCase().includes(query)).map(toGameCard);
    const games = matches.slice(0, limit), last = games.at(-1);
    return {games, ...(matches.length > limit && last ? {nextCursor: Buffer.from(JSON.stringify({createdAt:last.createdAt,id:last.id,query})).toString('base64url')} : {})};
  }
  /** Committed public snapshots only. The caller owns the returned release function. */
  subscribe(id: string, afterRevision: number, send: (game: PublicGame) => void, close: () => void = () => {}): () => void {
    const current = this.get(id);
    if (!Number.isSafeInteger(afterRevision) || afterRevision < 0) fail(400, 'INVALID_INPUT', '版本号无效。');
    if (this.subscriptions.size + this.waiters.size >= 128) fail(429, 'BUSY', '等待连接过多。');
    const subscription = {gameId:id, revision:Math.max(current.revision, afterRevision), send, close};
    this.subscriptions.add(subscription);
    try { if (current.revision > afterRevision) send(current); }
    catch (error) { this.subscriptions.delete(subscription); throw error; }
    return () => { this.subscriptions.delete(subscription); };
  }
  waitPublic(id: string, input: {afterRevision: number; timeoutMs?: number; signal?: AbortSignal}): Promise<PublicGame> {
    const current = this.get(id);
    if (!Number.isSafeInteger(input.afterRevision) || input.afterRevision < 0) return Promise.reject(new CourtServiceError(400, 'INVALID_INPUT', '版本号无效。'));
    const timeout = Math.max(0, Math.min(input.timeoutMs ?? 15000, 20000));
    if (!Number.isFinite(timeout)) return Promise.reject(new CourtServiceError(400, 'INVALID_INPUT', '等待时间无效。'));
    if (input.signal?.aborted) return Promise.reject(new CourtServiceError(499, 'DISCONNECTED', '连接已断开。'));
    if (current.revision > input.afterRevision) return Promise.resolve(current);
    return new Promise((resolveWait, reject) => {
      let release = () => {}; let timer: ReturnType<typeof setTimeout> | undefined;
      const clean = () => { release(); if (timer) clearTimeout(timer); input.signal?.removeEventListener('abort', aborted); };
      const aborted = () => { clean(); reject(new CourtServiceError(499, 'DISCONNECTED', '连接已断开。')); };
      const closed = () => { clean(); reject(new CourtServiceError(503, 'CLOSED', '庭审服务已关闭。')); };
      release = this.subscribe(id, input.afterRevision, game => { clean(); resolveWait(game); }, closed);
      input.signal?.addEventListener('abort', aborted, {once:true});
      timer = setTimeout(() => { clean(); resolveWait(this.get(id)); }, timeout);
    });
  }
  get(id: string): PublicGame { return this.public(this.game(id)); }
  invite(id: string, input: {role: CourtRole; ownerToken?: string}): GameInvitation {
    const game = copy(this.game(id)); const r = role(input.role);
    if (game.mode !== 'multiplayer' && (!input.ownerToken || hash(input.ownerToken) !== game.ownerHash)) return fail(403, 'OWNER_REQUIRED', '只有创建者可以取回排练入场邀请。');
    const invitation = this.invitation(game, r); this.save(game); return invitation;
  }
  inspectInvitation(ticket: string) {
    const entry = this.tickets.get(text(ticket, '邀请', 200)) || fail(404, 'NOT_FOUND', '邀请不存在。');
    const game = this.game(entry.gameId);
    return {gameId: game.id, role: entry.role, claimed: !!entry.claimed, game: this.public(game), guidePath: '/agents/guide.md', rolePromptPath: `/agents/roles/${entry.role}.md`};
  }
  invitationContext(ticket: string): InvitationContext {
    const info = this.inspectInvitation(ticket);
    const entry = this.tickets.get(ticket)!;
    return entry.claimed ? this.state(entry.claimed.seatToken) : {
      game:info.game, gameId:info.gameId, role:info.role, claimed:false, action:'claim',
      guidePath:info.guidePath, rolePromptPath:info.rolePromptPath, claimPath:`/api/invitations/${ticket}/claim`,
    };
  }
  join(input: {ticket: string; agentName: string; clientActionId: string}) {
    this.open(); const ticket = text(input.ticket, '邀请', 200); const entry = this.tickets.get(ticket) || fail(404, 'NOT_FOUND', '邀请不存在。');
    const agentName = text(input.agentName, 'Agent 名称', 100), actionId = text(input.clientActionId, '操作编号');
    const fingerprint = JSON.stringify({agentName});
    if (entry.claimed) {
      if (entry.claimed.actionId !== actionId || entry.claimed.fingerprint !== fingerprint) return fail(409, 'TICKET_CLAIMED', '入场邀请已被领取。');
      return {seatToken: entry.claimed.seatToken, gameId: entry.gameId, role: entry.role, state: this.state(entry.claimed.seatToken)};
    }
    const game = copy(this.game(entry.gameId)); const seatToken = token();
    game.seats[entry.role] = {...game.seats[entry.role], status:'claimed', agentName, tokenHash: hash(seatToken)};
    this.tickets.set(ticket, {...entry, claimed: {actionId, fingerprint, seatToken}});
    this.change(game); this.pump(game); this.save(game);
    return {seatToken, gameId: game.id, role: entry.role, state: this.state(seatToken)};
  }
  state(rawToken: string): AgentState {
    const {game, role: r} = this.auth(rawToken); const pub = this.public(game);
    const noMoreTurns = !game.session.pendingTurns.some(step => step.role === r);
    const finished = game.session.status === 'completed' || (r === 'judge' ? !!game.prepared : noMoreTurns);
    const canSubmit = !finished && pub.currentRole === r;
    const prepare = !finished && r === 'judge' && game.session.status === 'awaiting-ruling';
    return {game:pub, role:r, roleFinished:finished, canSubmit, turnId: canSubmit ? pub.currentTurnId : null, expectedRevision:game.revision,
      action: finished ? 'finished' : prepare ? 'prepare_verdicts' : canSubmit ? 'submit_turn' : 'wait', guidePath:'/agents/guide.md', rolePromptPath:`/agents/roles/${r}.md`,
      receipts:Object.entries(game.actions).filter(([key])=>key.startsWith(`${hash(rawToken)}:`)).map(([key,value])=>({clientActionId:key.slice(65),kind:JSON.parse(value.fingerprint).kind,...value.result as object}))};
  }
  private dedup(game: InternalGame, rawToken: string, input: {clientActionId: string}, kind: string): {key: string; fingerprint: string; existing?: unknown} {
    const key = `${hash(rawToken)}:${text(input.clientActionId, '操作编号')}`;
    const fingerprint = JSON.stringify({kind, input});
    const previous = game.actions[key];
    if (previous && previous.fingerprint !== fingerprint) fail(409, 'ACTION_CONFLICT', '同一操作编号不能提交不同内容。');
    return {key, fingerprint, ...(previous ? {existing: previous.result} : {})};
  }
  speak(rawToken: string, input: AgentTurnInput): AgentState {
    const auth = this.auth(rawToken); const game = copy(auth.game); const action = this.dedup(game, rawToken, input, 'turn');
    if (action.existing) return this.state(rawToken);
    const state = this.state(rawToken);
    if (!state.canSubmit) fail(409, 'NOT_YOUR_TURN', '当前还未轮到该席位。');
    if (input.revision !== game.revision || input.turnId !== state.turnId) fail(409, 'STALE_TURN', '轮次或版本已变化，请读取当前状态再提交。');
    if (!input.payload || typeof input.payload !== 'object' || ((input.payload as {speaker?: unknown}).speaker !== undefined && (input.payload as {speaker?: unknown}).speaker !== auth.role)) fail(403, 'ROLE_SCOPE', '席位令牌不能冒充其他角色。');
    game.session = applyExternalCourtTurn(game.session, {...input.payload as object, speaker: auth.role});
    this.change(game); this.pump(game);
    game.actions[action.key] = { fingerprint: action.fingerprint, result: {acceptedTurnId:input.turnId} }; this.save(game);
    return this.state(rawToken);
  }
  prepareVerdicts(rawToken: string, input: PrepareVerdictsInput): AgentState {
    const auth = this.auth(rawToken); const game = copy(auth.game); const action = this.dedup(game, rawToken, input, 'verdicts');
    if (action.existing) return this.state(rawToken);
    if (auth.role !== 'judge') fail(403, 'ROLE_SCOPE', '只有法官席可以准备判词。');
    if (game.prepared) fail(409, 'ALREADY_PREPARED', '条件判词已经封存。');
    if (input.revision !== undefined && input.revision !== game.revision) fail(409, 'STALE_TURN', '版本已变化，请先读取当前状态。');
    this.prepare(game, input.plaintiff, input.defendant, 'external'); this.settle(game);
    game.actions[action.key] = {fingerprint: action.fingerprint, result:{prepared:true}}; this.save(game); return this.state(rawToken);
  }
  visitor(existing?: string): {visitorToken: string; csrfToken: string} {
    this.open();
    if (existing && this.visitors.has(hash(existing))) return {visitorToken:existing, csrfToken:this.visitors.get(hash(existing))!.csrf};
    const raw = token(), entry = {csrf:token(), createdAt:this.now()};
    this.db.prepare('INSERT INTO visitors VALUES (?, ?)').run(hash(raw), JSON.stringify(entry)); this.visitors.set(hash(raw), entry);
    return {visitorToken:raw, csrfToken:entry.csrf};
  }
  vote(id: string, input: {visitorToken: string; csrfToken: string; winner: JuryWinner; clientActionId: string}): PublicGame {
    this.open(); const visitor = this.visitors.get(hash(text(input.visitorToken, '访客凭证', 200)));
    if (!visitor || visitor.csrf !== input.csrfToken) return fail(403, 'CSRF', '需要有效的浏览器陪审凭证。');
    if (input.winner !== 'plaintiff' && input.winner !== 'defendant') return fail(400, 'INVALID_VOTE', '请选择原告或被告。');
    const game = copy(this.game(id)); const identity = hash(input.visitorToken); const action = this.dedup(game, input.visitorToken, input, 'vote');
    if (action.existing) return this.public(game);
    if (game.votes[identity]) fail(409, 'ALREADY_VOTED', '这个浏览器已在本案投过票。');
    if (game.session.status !== 'awaiting-ruling' || game.outcome !== 'pending' || (game.deadlineAt && this.now() >= game.deadlineAt)) return fail(409, 'VOTE_CLOSED', '本案当前不接受陪审票。');
    game.votes[identity] = input.winner; this.change(game); this.settle(game);
    game.actions[action.key] = {fingerprint:action.fingerprint, result:{voted:true}}; this.save(game); return this.public(game);
  }
  wait(rawToken: string, input: {afterRevision: number; timeoutMs?: number; signal?: AbortSignal}): Promise<AgentState> {
    const state = this.state(rawToken);
    if (!Number.isSafeInteger(input.afterRevision) || input.afterRevision < 0) return Promise.reject(new CourtServiceError(400,'INVALID_INPUT','版本号无效。'));
    if (input.signal?.aborted) return Promise.reject(new CourtServiceError(499,'DISCONNECTED','连接已断开。'));
    if (state.expectedRevision > input.afterRevision || state.roleFinished) return Promise.resolve(state);
    const timeout = Math.max(0, Math.min(input.timeoutMs ?? 15000, 20000));
    if (!Number.isFinite(timeout)) return Promise.reject(new CourtServiceError(400,'INVALID_INPUT','等待时间无效。'));
    if (this.waiters.size + this.subscriptions.size >= 128) return Promise.reject(new CourtServiceError(429,'BUSY','等待连接过多。'));
    return new Promise((resolveWait, reject) => {
      const cleanup = () => { clearTimeout(waiter.timer); this.waiters.delete(waiter); input.signal?.removeEventListener('abort', aborted); };
      const aborted = () => { cleanup(); reject(new CourtServiceError(499,'DISCONNECTED','连接已断开。')); };
      const waiter: Waiter = {gameId: state.game.id, revision:input.afterRevision, token:rawToken, resolve:resolveWait, reject, cleanup,
        timer:setTimeout(() => { cleanup(); resolveWait(this.state(rawToken)); },timeout)};
      this.waiters.add(waiter); input.signal?.addEventListener('abort',aborted,{once:true});
    });
  }
  tick() {
    this.open();
    for (const old of [...this.games.values()]) {
      if (old.session.status === 'completed' || old.outcome === 'unresolved') continue;
      const game = copy(old); const before = game.revision; this.pump(game);
      if (game.revision !== before) this.save(game);
    }
  }
  close() {
    if (this.closed) return;
    if (this.timer) clearInterval(this.timer);
    for (const waiter of [...this.waiters]) { waiter.cleanup(); waiter.reject(new CourtServiceError(503,'CLOSED','庭审服务已关闭。')); }
    this.waiters.clear();
    for (const subscription of [...this.subscriptions]) { this.subscriptions.delete(subscription); subscription.close(); }
    this.db.close(); this.closed = true;
  }
}
