import type { GameCard } from '../types/platform';

export interface AdminGameCard extends GameCard { hidden?: boolean }
export interface AdminOverview { admin: string; todayCreated: number; groups: { mode: string; status: string; n: number }[] }
export interface AdminDetail {
  admin: string;
  game: GameCard & { revision: number; session: { caseData: { summary: string; coreClash: string }; ruling?: { result: string; quote?: string; reasons: string[] } | null; turns: { id: string; speaker: string; text: string }[] } };
  internal: {
    hidden: boolean;
    seats: Record<string, { role: string; source: string; status: string; agentName?: string; claim?: { actionId: string; agentName?: string }; ticket?: string }>;
    votes: Record<string, string>;
    ownerHash: string;
    prepared: { plaintiff: unknown; defendant: unknown; preparedAt: number; source: string; publishedAt?: number } | null;
  };
}
const TOKEN_KEY = 'internet-court:admin-dev-token';
export const adminDevToken = {
  read: () => { try { return sessionStorage.getItem(TOKEN_KEY) || undefined; } catch { return undefined; } },
  save: (token: string) => { try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* private mode */ } },
};
async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = adminDevToken.read();
  const response = await fetch(path, { ...init, credentials: 'same-origin', signal: AbortSignal.timeout(15000),
    headers: { 'content-type': 'application/json', ...(token ? { 'x-court-admin-token': token } : {}), ...init.headers } });
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error(`管理接口返回异常（HTTP ${response.status}）。`); }
  if (!response.ok) throw new Error((data as { message?: string })?.message || `管理请求失败（HTTP ${response.status}）。`);
  return data as T;
}
export const adminClient = {
  overview: () => adminRequest<AdminOverview>('/api/admin/overview'),
  games: (query: { q?: string; status?: string; cursor?: string } = {}) => {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.status) params.set('status', query.status);
    if (query.cursor) params.set('cursor', query.cursor);
    return adminRequest<{ games: AdminGameCard[]; nextCursor?: string }>('/api/admin/games?' + params);
  },
  detail: (id: string) => adminRequest<AdminDetail>('/api/admin/games/' + encodeURIComponent(id)),
  action: (id: string, op: 'close-votes' | 'void' | 'unvoid' | 'revoke-tickets' | 'resync' | 'purge') =>
    adminRequest<{ admin: string; [key: string]: unknown }>('/api/admin/games/' + encodeURIComponent(id) + '/' + op, { method: 'POST', body: '{}' }),
};
