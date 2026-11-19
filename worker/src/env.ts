/** Worker bindings, declared in wrangler.toml. Types only — erased at build time. */
export interface Env {
  /** One CourtRoom Durable Object per game, named by game id. */
  COURT_ROOM: DurableObjectNamespace;
  /** Public lobby / judgment index. The room object stays authoritative. */
  DB: D1Database;
  ASSETS: Fetcher;
  /** HMAC key for stateless visitor cookies. Set via wrangler secret or .dev.vars. */
  COURT_VISITOR_SECRET?: string;
  COURT_PUBLIC_BASE_URL?: string;
  /** Cloudflare Access team name (e.g. "myteam") and the admin app's AUD tag. */
  COURT_ACCESS_TEAM?: string;
  COURT_ACCESS_AUD?: string;
  /** Development-only admin bypass; never set in production. */
  COURT_ADMIN_DEV_TOKEN?: string;
  /** Optional per-IP limiter for game creation, see wrangler.toml. */
  COURT_CREATE_LIMIT?: RateLimit;
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'HttpError'; }
}
export const fail = (status: number, code: string, message: string): never => { throw new HttpError(status, code, message); };

const randomBytes = (length: number): Uint8Array => crypto.getRandomValues(new Uint8Array(length));
export const base64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const randomToken = (bytes = 24): string => base64url(randomBytes(bytes));
/** Tokens carry their game id prefix so the worker can route without a global index. */
export const scopedToken = (gameId: string, bytes = 18): string => `${gameId}.${randomToken(bytes)}`;
const SCOPED = /^([A-Za-z0-9_-]{6,64})\.([A-Za-z0-9_-]{6,128})$/;
export function parseScopedToken(token: string): { gameId: string; secret: string } | undefined {
  const match = SCOPED.exec(token);
  return match ? { gameId: match[1], secret: match[2] } : undefined;
}
/** Deterministic room id for idempotent creates: same clientActionId lands on the same room. */
export function deriveGameId(clientActionId: string, hash: (value: string) => string): string {
  return hash('court-create:' + clientActionId).slice(0, 12);
}
export const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } });
export const errorResponse = (error: unknown): Response => {
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : 'INTERNAL';
  const message = status === 500 ? '庭审服务发生错误，操作未确认。请先查询状态。' : (error as Error).message;
  return jsonResponse({ error: code, message }, status);
};
