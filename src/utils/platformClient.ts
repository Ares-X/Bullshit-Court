import type { CourtRole, CaseData } from '../types';
import type { CreateGameResult, GameInvitation, PlatformMode, PublicGame, JuryWinner } from '../types/platform';

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
  list: (signal?: AbortSignal) => request<{ games: PublicGame[] }>('/api/games', {}, signal),
  get: (id: string, signal?: AbortSignal) => request<PublicGame>('/api/games/' + encodeURIComponent(id), {}, signal),
  create: (caseData: CaseData, role: CourtRole, mode: PlatformMode, clientActionId: string, signal?: AbortSignal) =>
    request<CreateGameResult>('/api/games', { method: 'POST', body: JSON.stringify({ caseData, role, mode, clientActionId }) }, signal),
  invite: (id: string, role: CourtRole, ownerToken?: string, signal?: AbortSignal) =>
    request<GameInvitation>('/api/games/' + encodeURIComponent(id) + '/invitations', { method: 'POST', body: JSON.stringify({ role, ...(ownerToken ? { ownerToken } : {}) }) }, signal),
  visitor: (signal?: AbortSignal) => request<{ csrfToken: string }>('/api/visitor', {}, signal),
  vote: (id: string, winner: JuryWinner, csrfToken: string, clientActionId: string, signal?: AbortSignal) =>
    request<PublicGame>('/api/games/' + encodeURIComponent(id) + '/votes', { method: 'POST', headers: { 'x-court-csrf': csrfToken }, body: JSON.stringify({ winner, clientActionId }) }, signal),
};
