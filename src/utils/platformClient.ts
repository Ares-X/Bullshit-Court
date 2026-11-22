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
const apiGamePath = (id: string) => '/api' + publicGamePath(id);
const roomKeyStorage = (id: string) => 'internet-court:room-key:' + id;
export function roomFragment(id: string) {
  return new URLSearchParams(window.location.pathname.replace(/\/$/, '') === publicGamePath(id) ? window.location.hash.slice(1) : '');
}
export function rememberRoomKey(id: string, key: string) {
  try { sessionStorage.setItem(roomKeyStorage(id), key); } catch { /* Current link still carries the key. */ }
}
export function roomAccessKey(id: string): string | undefined {
  const fromLink = roomFragment(id).get('key');
  if (fromLink && /^[A-Za-z0-9_.-]{16,200}$/.test(fromLink)) return fromLink;
  try { return sessionStorage.getItem(roomKeyStorage(id)) || undefined; } catch { return undefined; }
}
export function roomSharePath(id: string, responseTicket?: string, key = roomAccessKey(id)) {
  const params = new URLSearchParams();
  if (key) params.set('key', key);
  if (responseTicket) params.set('respond', responseTicket);
  return publicGamePath(id) + (params.size ? '#' + params : '');
}
export function roomEventsPath(id: string, after: number) {
  const params = new URLSearchParams({ after: String(after) });
  const key = roomAccessKey(id);
  if (key) params.set('key', key);
  return apiGamePath(id) + '/events?' + params;
}
function roomHeaders(id: string, csrfToken?: string): Record<string, string> {
  const key = roomAccessKey(id);
  return { ...(key ? { 'x-court-room-key': key } : {}), ...(csrfToken ? { 'x-court-csrf': csrfToken } : {}) };
}
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
  get: (id: string, signal?: AbortSignal) => request<PublicGame>(apiGamePath(id), { headers: roomHeaders(id) }, signal),
  capabilities: (signal?: AbortSignal) => request<{ builtinJudge: boolean }>('/api/capabilities', {}, signal),
  create: async (input: CreateGameInput, signal?: AbortSignal) => {
    const visitor = input.party && await request<{ csrfToken: string }>('/api/visitor', {}, signal);
    return request<CreateGameResult>('/api/games', {
      method: 'POST', headers: visitor ? { 'x-court-csrf': visitor.csrfToken } : {}, body: JSON.stringify(input),
    }, signal);
  },
  invite: (id: string, role: CourtRole, ownerToken?: string, signal?: AbortSignal) =>
    request<GameInvitation>(apiGamePath(id) + '/invitations', { method: 'POST', headers: roomHeaders(id), body: JSON.stringify({ role, ...(ownerToken ? { ownerToken } : {}) }) }, signal),
  visitor: (signal?: AbortSignal) => request<{ csrfToken: string }>('/api/visitor', {}, signal),
  jurySeat: (id: string, signal?: AbortSignal) =>
    request<{ seated: boolean; participant?: boolean; vote?: JuryWinner }>(apiGamePath(id) + '/jury-seat', { headers: roomHeaders(id) }, signal),
  joinJury: (id: string, csrfToken: string, signal?: AbortSignal) =>
    request<PublicGame>(apiGamePath(id) + '/jury-seat',
      { method: 'POST', headers: roomHeaders(id, csrfToken), body: '{}' }, signal),
  react: (id: string, reaction: JuryReactionInput, csrfToken: string, clientActionId: string, signal?: AbortSignal) =>
    request<PublicGame>(apiGamePath(id) + '/reactions',
      { method: 'POST', headers: roomHeaders(id, csrfToken), body: JSON.stringify({ ...reaction, clientActionId }) }, signal),
  vote: (id: string, winner: JuryWinner, csrfToken: string, clientActionId: string, signal?: AbortSignal) =>
    request<PublicGame>(apiGamePath(id) + '/votes', { method: 'POST', headers: roomHeaders(id, csrfToken), body: JSON.stringify({ winner, clientActionId }) }, signal),
  respond: (id: string, ticket: string, stance: string, useAgent: boolean, csrfToken: string, signal?: AbortSignal) =>
    request<PublicGame>(apiGamePath(id) + '/respond', { method: 'POST', headers: roomHeaders(id, csrfToken), body: JSON.stringify({ ticket, useAgent, ...(useAgent ? {} : { stance }) }) }, signal),
};
