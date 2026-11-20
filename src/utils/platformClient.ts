import type { CourtRole } from '../types';
import type { AgentState, AgentTurnInput, CreateGameInput, CreateGameResult, GameCard, GameInvitation, PrepareVerdictsInput, PublicGame, JuryReactionInput, JuryWinner } from '../types/platform';

export class PlatformRequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); this.name = 'PlatformRequestError'; }
}
async function request<T>(path: string, options: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const boundedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000);
  const response = await fetch(path, { ...options, credentials: 'same-origin', signal: boundedSignal,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers } });
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new PlatformRequestError('庭审服务未返回有效数据，请确认已启动新版服务。', response.status); }
  if (!response.ok) {
    const problem = data as { message?: string; error?: string };
    throw new PlatformRequestError(problem.message || '庭审请求未完成，请先检查当前状态。', response.status, problem.error);
  }
  return data as T;
}
export const newActionId = () => globalThis.crypto.randomUUID();
export const publicGamePath = (id: string) => '/games/' + encodeURIComponent(id);
export const platformClient = {
  judgments: (query = '', cursor?: string, limit = 12, signal?: AbortSignal) => {
    const params = new URLSearchParams({ query, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return request<{ games: GameCard[]; nextCursor?: string }>('/api/judgments?' + params, {}, signal);
  },
  claim: (ticket: string, agentName: string, clientActionId: string, signal?: AbortSignal) =>
    request<{ seatToken: string; gameId: string; role: CourtRole; state: AgentState }>('/api/invitations/' + encodeURIComponent(ticket) + '/claim', { method: 'POST', body: JSON.stringify({ agentName, clientActionId }) }, signal),
  agentState: (id: string, seatToken: string, signal?: AbortSignal) => request<AgentState>('/api/games/' + encodeURIComponent(id) + '/agent', { headers: { Authorization: 'Bearer ' + seatToken } }, signal),
  agentTurn: (id: string, seatToken: string, input: AgentTurnInput, signal?: AbortSignal) => request<AgentState>('/api/games/' + encodeURIComponent(id) + '/turns', { method: 'POST', headers: { Authorization: 'Bearer ' + seatToken }, body: JSON.stringify(input) }, signal),
  agentVerdicts: (id: string, seatToken: string, input: PrepareVerdictsInput, signal?: AbortSignal) => request<AgentState>('/api/games/' + encodeURIComponent(id) + '/verdicts', { method: 'POST', headers: { Authorization: 'Bearer ' + seatToken }, body: JSON.stringify(input) }, signal),
  list: (signal?: AbortSignal) => request<{ games: GameCard[] }>('/api/games', {}, signal),
  get: (id: string, signal?: AbortSignal) => request<PublicGame>('/api/games/' + encodeURIComponent(id), {}, signal),
  capabilities: (signal?: AbortSignal) => request<{ builtinJudge: boolean }>('/api/capabilities', {}, signal),
  create: (input: CreateGameInput, signal?: AbortSignal) =>
    request<CreateGameResult>('/api/games', { method: 'POST', body: JSON.stringify(input) }, signal),
  invite: (id: string, role: CourtRole, ownerToken?: string, signal?: AbortSignal) =>
    request<GameInvitation>('/api/games/' + encodeURIComponent(id) + '/invitations', { method: 'POST', body: JSON.stringify({ role, ...(ownerToken ? { ownerToken } : {}) }) }, signal),
  visitor: (signal?: AbortSignal) => request<{ csrfToken: string }>('/api/visitor', {}, signal),
  jurySeat: (id: string, signal?: AbortSignal) =>
    request<{ seated: boolean }>(('/api' + publicGamePath(id)) + '/jury-seat', {}, signal),
  joinJury: (id: string, csrfToken: string, signal?: AbortSignal) =>
    request<PublicGame>(('/api' + publicGamePath(id)) + '/jury-seat',
      { method: 'POST', headers: { 'x-court-csrf': csrfToken }, body: '{}' }, signal),
  react: (id: string, reaction: JuryReactionInput, csrfToken: string, clientActionId: string, signal?: AbortSignal) =>
    request<PublicGame>(('/api' + publicGamePath(id)) + '/reactions',
      { method: 'POST', headers: { 'x-court-csrf': csrfToken }, body: JSON.stringify({ ...reaction, clientActionId }) }, signal),
  vote: (id: string, winner: JuryWinner, csrfToken: string, clientActionId: string, signal?: AbortSignal) =>
    request<PublicGame>('/api/games/' + encodeURIComponent(id) + '/votes', { method: 'POST', headers: { 'x-court-csrf': csrfToken }, body: JSON.stringify({ winner, clientActionId }) }, signal),
};
