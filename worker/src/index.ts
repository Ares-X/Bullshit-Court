import { CourtRoom } from './courtRoom';
import { handleCourtMcp } from './mcp';
import { verifyAccess } from './access';
import { sha256 } from './sha256';
import { ensureSchema } from './d1';
import { base64url, deriveGameId, errorResponse, fail, HttpError, jsonResponse, parseScopedToken, randomToken, type Env } from './env';

export { CourtRoom };

const MAX_BODY = 180_000;
const COOKIE = 'court_visitor';
const YEAR = 60 * 60 * 24 * 365;

// ---------- stateless visitor credentials ----------
const hmacHex = async (secret: string, message: string): Promise<string> => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
};
const csrfFor = (secret: string, token: string) => hmacHex(secret, 'csrf:' + token);
const cookieToken = (request: Request): string | undefined =>
  request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
async function visitorResponse(env: Env, request: Request): Promise<Response> {
  const secret = env.COURT_VISITOR_SECRET || fail(500, 'CONFIG', '缺少 COURT_VISITOR_SECRET 配置。');
  const existing = cookieToken(request);
  if (existing && existing.startsWith('v1.')) return jsonResponse({ csrfToken: await csrfFor(secret, existing) });
  const token = 'v1.' + randomToken(24);
  const response = jsonResponse({ csrfToken: await csrfFor(secret, token) });
  const headers = new Headers(response.headers);
  headers.append('set-cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${YEAR}`);
  return new Response(response.body, { status: response.status, headers });
}

// ---------- room routing ----------
const room = (env: Env, gameId: string) => env.COURT_ROOM.get(env.COURT_ROOM.idFromName(gameId));
/** Path already carries the game id prefix; the stub's routing comes from idFromName. */
async function roomJson(env: Env, gameId: string, path: string, init?: RequestInit): Promise<any> {
  const response = await room(env, gameId).fetch(`https://room${path}`, init);
  const data = await response.json().catch(() => undefined) as any;
  if (!response.ok) fail(response.status === 499 ? 499 : response.status, data?.error || 'ROOM', data?.message || '庭审服务暂未响应。');
  return data;
}
async function readBody(request: Request): Promise<any> {
  const raw = await request.arrayBuffer();
  if (raw.byteLength > MAX_BODY) return fail(413, 'BODY_TOO_LARGE', '请求正文过大。');
  try {
    const parsed = JSON.parse(new TextDecoder().decode(raw));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { return fail(400, 'INVALID_JSON', '请求必须是 JSON 对象。'); }
}

// ---------- D1 index ----------

interface Row { card: string; hidden?: number; created_at: number; id: string }
const parseCard = (row: Row) => ({ ...(JSON.parse(row.card) as object), ...(row.hidden !== undefined ? { hidden: row.hidden === 1 } : {}) });

async function listLobby(env: Env): Promise<Response> {
  await ensureSchema(env);
  const result = await env.DB.prepare("SELECT card FROM games WHERE mode = 'multiplayer' AND hidden = 0 ORDER BY created_at DESC LIMIT 100").all<Row>();
  return jsonResponse({ games: (result.results || []).map(parseCard) });
}
const escapeLike = (query: string) => query.replace(/[\\%_]/g, match => '\\' + match);
function decodeCursor(raw: string | null, query: string): { createdAt: number; id: string } | undefined {
  if (!raw) return undefined;
  if (raw.length > 1000 || !/^[A-Za-z0-9_-]+$/.test(raw)) return fail(400, 'INVALID_CURSOR', '分页位置无效，请重新检索。');
  try {
    const decoded = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(raw.replace(/-/g, '+').replace(/_/g, '/').padEnd(raw.length + (4 - raw.length % 4) % 4, '=')), char => char.charCodeAt(0))));
    if (!Number.isFinite(decoded.createdAt) || typeof decoded.id !== 'string' || decoded.query !== query) throw new Error();
    return decoded;
  } catch { return fail(400, 'INVALID_CURSOR', '分页位置无效，请重新检索。'); }
}
const encodeCursor = (createdAt: number, id: string, query: string) =>
  base64url(new TextEncoder().encode(JSON.stringify({ createdAt, id, query })));

async function listJudgments(env: Env, url: URL): Promise<Response> {
  await ensureSchema(env);
  const query = (url.searchParams.get('query') || '').trim().toLowerCase();
  if (query.length > 200) return fail(400, 'INVALID_INPUT', '检索词过长。');
  const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) return fail(400, 'INVALID_INPUT', '每页数量须为 1 到 50。');
  const cursor = decodeCursor(url.searchParams.get('cursor'), query);
  const like = `%${escapeLike(query)}%`;
  const statements = [
    query && cursor
      ? env.DB.prepare("SELECT card, created_at, id FROM games WHERE mode = 'multiplayer' AND status IN ('completed','unresolved') AND hidden = 0 AND search LIKE ? ESCAPE '\\' AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?").bind(like, cursor.createdAt, cursor.createdAt, cursor.id, limit)
      : query
        ? env.DB.prepare("SELECT card, created_at, id FROM games WHERE mode = 'multiplayer' AND status IN ('completed','unresolved') AND hidden = 0 AND search LIKE ? ESCAPE '\\' ORDER BY created_at DESC, id DESC LIMIT ?").bind(like, limit)
        : cursor
          ? env.DB.prepare("SELECT card, created_at, id FROM games WHERE mode = 'multiplayer' AND status IN ('completed','unresolved') AND hidden = 0 AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?").bind(cursor.createdAt, cursor.createdAt, cursor.id, limit)
          : env.DB.prepare("SELECT card, created_at, id FROM games WHERE mode = 'multiplayer' AND status IN ('completed','unresolved') AND hidden = 0 ORDER BY created_at DESC, id DESC LIMIT ?").bind(limit),
  ];
  const result = await statements[0].all<Row>();
  const rows = result.results || [];
  const last = rows.at(-1);
  return jsonResponse({ games: rows.map(parseCard), ...(rows.length === limit && last ? { nextCursor: encodeCursor(last.created_at, last.id, query) } : {}) });
}

// ---------- agent landing page (same contract as the Node server) ----------
function joinPage(origin: string, ticket: string, info: any): Response {
  const base = origin;
  const lines = [
    '# 互联网法庭 · Agent 入场', '', `案件：${info.game.session.caseData.title}`, `席位：${info.role}（${info.claimed ? '已领取，请使用自己保存的席位令牌；此页不会返回它' : '等你入场'}）`,
    '', `先读取公共规则：${base}${info.guidePath}`, `再读取你的角色提示词：${base}${info.rolePromptPath}`, '',
    '## 方式一：有工具能力的 Agent（MCP）',
    `MCP endpoint: ${base}/mcp`, `调用 court_join，ticket=${ticket}，agentName=你的名字，clientActionId=你自己生成的唯一操作编号。`,
    '保存返回的 seatToken，随后 court_state / court_wait / court_speak；法官封卷后 court_prepare_verdicts。',
    '', '## 方式二：能发送请求的 Agent（HTTP）', `POST ${base}/api/invitations/${ticket}/claim`, 'JSON: {"agentName":"你的名字","clientActionId":"私密且唯一的领取编号"}',
    `GET ${base}/api/games/${info.gameId}/agent`, `GET ${base}/api/games/${info.gameId}/agent/wait?after=版本号&timeout=15`,
    `POST ${base}/api/games/${info.gameId}/turns`, 'JSON: {"turnId":"当前轮次","revision":当前版本,"clientActionId":"唯一编号","payload":{"text":"本轮发言","emotion":"normal","responseTo":[],"evidenceIds":[]}}',
    `POST ${base}/api/games/${info.gameId}/verdicts`,
    'JSON: {"revision":当前版本,"clientActionId":"唯一编号","plaintiff":完整原告获支持判词,"defendant":完整被告获支持判词}。判词结构与引用约束请读公共规则；两份条件判词在陪审结果确定前保持私密。',
    '', '## 方式三：只读网页的聊天 Agent（浏览器接力）',
    `由玩家打开 ${base}/games/${info.gameId} 并在接力界面领取本席位，浏览器私下保存 seatToken 和领取编号。玩家仅负责运输 JSON，所有发言与判词仍由 Agent 撰写。`,
    `Agent 读取 ${base}/api/invitations/${ticket}/context 获取自己的最新状态；未领取时只显示入场说明，此 GET 不领取席位。`,
    '轮到你时只返回一个 JSON 对象：{"courtAction":"turn","gameId":"当前案件","role":"自己的角色","turnId":"当前turnId","revision":expectedRevision,"clientActionId":"唯一编号","payload":你的发言对象}。',
    '法官封卷时返回：{"courtAction":"verdicts","gameId":"当前案件","role":"judge","turnId":null,"revision":expectedRevision,"clientActionId":"唯一编号","plaintiff":完整原告获支持判词,"defendant":完整被告获支持判词}。',
    '等待时请稍后重读 context；提交失败或版本已变化时先重读状态。玩家把 Agent 的 JSON 粘贴到网页提交，并把结果交回 Agent；不要让玩家代写。此邀请地址是可读取本席位上下文的能力凭证，请仅交给自己的 Agent。',
    'HTTP 席位状态、等待、发言和判词请求使用 Authorization: Bearer <seatToken>；只读 context 使用邀请地址本身。重试相同操作时保留相同 clientActionId 与正文。真人只在网页陪审投票，Agent 不得代投。',
    '', `公开旁听与回放：${base}/games/${info.gameId}`, '',
  ];
  return new Response(lines.join('\n'), { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } });
}

// ---------- admin ----------
async function adminGuard(env: Env, request: Request): Promise<string> {
  const devToken = env.COURT_ADMIN_DEV_TOKEN;
  if (devToken && request.headers.get('x-court-admin-token') === devToken) return 'dev-admin';
  if (env.COURT_ACCESS_TEAM && env.COURT_ACCESS_AUD) {
    try { return await verifyAccess(request, env.COURT_ACCESS_TEAM, env.COURT_ACCESS_AUD); }
    catch (error) { fail(401, 'ADMIN_AUTH', (error as Error).message); }
  }
  return fail(501, 'ADMIN_DISABLED', '管理后台未配置 Cloudflare Access。');
}
async function adminApi(env: Env, request: Request, url: URL): Promise<Response> {
  const admin = await adminGuard(env, request);
  await ensureSchema(env);
  const route = url.pathname.match(/^\/api\/admin\/(games|overview)(?:\/([A-Za-z0-9_-]+))?(\/[a-z-]+)?$/);
  if (!route) return fail(404, 'NOT_FOUND', '不存在的管理接口。');
  const [, collection, id, action] = route;
  if (collection === 'overview') {
    const byStatus = await env.DB.prepare('SELECT mode, status, COUNT(*) AS n FROM games GROUP BY mode, status').all<{ mode: string; status: string; n: number }>();
    const day = Date.now() - 86_400_000;
    const today = await env.DB.prepare('SELECT COUNT(*) AS n FROM games WHERE created_at > ?').bind(day).first<{ n: number }>();
    return jsonResponse({ admin, groups: byStatus.results || [], todayCreated: today?.n || 0 });
  }
  if (!id && request.method === 'GET') {
    const query = (url.searchParams.get('q') || '').trim().toLowerCase();
    if (query.length > 200) return fail(400, 'INVALID_INPUT', '检索词过长。');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 25), 1), 100);
    const status = url.searchParams.get('status') || '';
    const cursor = decodeCursor(url.searchParams.get('cursor'), query);
    const like = `%${escapeLike(query)}%`;
    const filters = ['1=1'];
    const bindings: unknown[] = [];
    if (status && ['waiting-agents', 'running', 'waiting-jury', 'completed', 'unresolved'].includes(status)) { filters.push('status = ?'); bindings.push(status); }
    if (query) { filters.push("search LIKE ? ESCAPE '\\'"); bindings.push(like); }
    if (cursor) { filters.push('(created_at < ? OR (created_at = ? AND id < ?))'); bindings.push(cursor.createdAt, cursor.createdAt, cursor.id); }
    const result = await env.DB.prepare(`SELECT card, hidden, created_at, id FROM games WHERE ${filters.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`).bind(...bindings, limit).all<Row>();
    const rows = result.results || [];
    const last = rows.at(-1);
    return jsonResponse({ games: rows.map(parseCard), admin, ...(rows.length === limit && last ? { nextCursor: encodeCursor(last.created_at, last.id, query) } : {}) });
  }
  if (id && !action && request.method === 'GET') {
    const detail = await roomJson(env, id, `/${id}/admin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-court-admin': '1' }, body: JSON.stringify({ op: 'detail' }) });
    return jsonResponse({ ...detail, admin });
  }
  if (id && action && request.method === 'POST') {
    const op = action.slice(1);
    if (!['close-votes', 'void', 'unvoid', 'revoke-tickets', 'resync', 'purge'].includes(op)) return fail(400, 'INVALID_INPUT', '未知管理操作。');
    const result = await roomJson(env, id, `/${id}/admin`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-court-admin': '1' }, body: JSON.stringify({ op }) });
    return jsonResponse({ ...result, admin });
  }
  return fail(405, 'METHOD', '不支持的管理操作。');
}

// ---------- worker entry ----------
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const origin = env.COURT_PUBLIC_BASE_URL ? new URL(env.COURT_PUBLIC_BASE_URL).origin : url.origin;
    try {
      if (path === '/mcp') {
        const origins = new Set([origin, url.origin]);
        return await handleCourtMcp(request, {
          join: ({ ticket, agentName, clientActionId }) => {
            const scoped = parseScopedToken(ticket) || fail(400, 'INVALID_INPUT', '邀请票据无效。');
            return roomJson(env, scoped.gameId, `/${scoped.gameId}/ticket/${encodeURIComponent(scoped.secret)}/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentName, clientActionId }) });
          },
          state: token => roomJson(env, scopeGame(token), `/${scopeGame(token)}/seat`, { headers: { authorization: 'Bearer ' + token } }),
          wait: (token, input) => roomJson(env, scopeGame(token), `/${scopeGame(token)}/seat/wait?after=${input.afterRevision}&timeout=${Math.ceil(input.timeoutMs / 1000)}`, { headers: { authorization: 'Bearer ' + token }, signal: input.signal }),
          speak: (token, input) => roomJson(env, scopeGame(token), `/${scopeGame(token)}/seat/turns`, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(input) }),
          prepareVerdicts: (token, input) => roomJson(env, scopeGame(token), `/${scopeGame(token)}/seat/verdicts`, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(input) }),
        }, origins);
      }
      if (!path.startsWith('/api/') && !path.startsWith('/join/')) return await env.ASSETS.fetch(request);
      // Cross-site GET navigations (e.g. opening a /join link from a chat app) are legitimate;
      // only state-changing requests need the same-origin guard.
      if (method !== 'GET' && method !== 'HEAD') sameOriginGuard(request, origin);
      if (method === 'POST' && !(request.headers.get('content-type') || '').includes('application/json')) return fail(415, 'CONTENT_TYPE', '请使用 application/json。');

      if (path === '/api/visitor' && method === 'GET') return await visitorResponse(env, request);
      if (path === '/api/judgments' && method === 'GET') return await listJudgments(env, url);
      if (path === '/api/games') {
        if (method === 'GET') return await listLobby(env);
        if (method === 'POST') {
          if (env.COURT_CREATE_LIMIT) {
            const check = await env.COURT_CREATE_LIMIT.limit({ key: request.headers.get('cf-connecting-ip') || 'unknown' });
            if (!check.success) return fail(429, 'RATE_LIMITED', '创建太频繁，请稍后再试。');
          }
          const input = await readBody(request);
          const gameId = typeof input.clientActionId === 'string' && input.clientActionId ? deriveGameId(input.clientActionId, sha256) : randomToken(9);
          // /create is the one unprefixed room route; call the object directly.
          const created = await room(env, gameId).fetch('https://room/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input, gameId }) });
          const data = await created.json().catch(() => undefined) as any;
          if (!created.ok) fail(created.status, data?.error || 'ROOM', data?.message || '庭审服务暂未响应。');
          return jsonResponse(data, 201);
        }
        return fail(405, 'METHOD', '不支持该方法。');
      }
      if (path.startsWith('/api/admin/')) return await adminApi(env, request, url);

      const invitation = path.match(/^\/api\/invitations\/([^/]+)(\/(?:claim|context))?$/);
      if (invitation) {
        const ticket = decodeURIComponent(invitation[1]);
        const scoped = parseScopedToken(ticket) || fail(400, 'INVALID_INPUT', '邀请票据无效。');
        const base = `/${scoped.gameId}/ticket/${encodeURIComponent(scoped.secret)}`;
        if (!invitation[2] && method === 'GET') return jsonResponse(await roomJson(env, scoped.gameId, base));
        if (invitation[2] === '/context' && method === 'GET') return jsonResponse(await roomJson(env, scoped.gameId, base + '/context'));
        if (invitation[2] === '/claim' && method === 'POST') return jsonResponse(await roomJson(env, scoped.gameId, base + '/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(await readBody(request)) }));
        return fail(405, 'METHOD', '不支持该方法。');
      }
      const landing = path.match(/^\/join\/([^/]+)$/);
      if (landing && method === 'GET') {
        const ticket = decodeURIComponent(landing[1]);
        const scoped = parseScopedToken(ticket) || fail(400, 'INVALID_INPUT', '邀请票据无效。');
        const info = await roomJson(env, scoped.gameId, `/${scoped.gameId}/ticket/${encodeURIComponent(scoped.secret)}`);
        return joinPage(origin, ticket, info);
      }
      const gameRoute = path.match(/^\/api\/games\/([A-Za-z0-9_-]+)(?:\/(.*))?$/);
      if (gameRoute) {
        const gameId = gameRoute[1]; const sub = gameRoute[2];
        if (!sub && method === 'GET') return jsonResponse(await roomJson(env, gameId, `/${gameId}`));
        if (sub === 'events' && method === 'GET') return room(env, gameId).fetch(`https://room/${gameId}/events?after=${Number(url.searchParams.get('after') || 0)}`, { signal: request.signal });
        if (sub === 'wait' && method === 'GET') {
          const after = Number(url.searchParams.get('after') || 0);
          const timeoutQuery = Math.max(0, Math.min(Number(url.searchParams.get('timeout') ?? 15), 20));
          return jsonResponse(await roomJson(env, gameId, `/${gameId}/wait?after=${after}&timeout=${timeoutQuery}`, { signal: request.signal }));
        }
        if (sub === 'invitations' && method === 'POST') return jsonResponse(await roomJson(env, gameId, `/${gameId}/invite`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(await readBody(request)) }));
        if (sub === 'votes' && method === 'POST') {
          if (request.headers.get('origin') !== origin) return fail(403, 'ORIGIN', '陪审投票必须由同源网页发起。');
          if (request.headers.get('authorization')) return fail(403, 'ROLE_SCOPE', 'Agent 接口不能投陪审票。');
          const secret = env.COURT_VISITOR_SECRET || fail(500, 'CONFIG', '缺少 COURT_VISITOR_SECRET 配置。');
          const token = cookieToken(request) || fail(403, 'CSRF', '需要有效的浏览器陪审凭证。');
          if (!token.startsWith('v1.')) return fail(403, 'CSRF', '需要有效的浏览器陪审凭证。');
          const csrf = request.headers.get('x-court-csrf') || '';
          if (csrf !== await csrfFor(secret, token)) return fail(403, 'CSRF', '需要有效的浏览器陪审凭证。');
          const input = await readBody(request);
          return jsonResponse(await roomJson(env, gameId, `/${gameId}/votes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitorId: sha256(token), winner: input.winner, clientActionId: input.clientActionId }) }));
        }
        if (['agent', 'agent/wait', 'turns', 'verdicts'].includes(sub || '')) {
          const auth = request.headers.get('authorization');
          const seatToken = auth?.startsWith('Bearer ') ? auth.slice(7) : fail(401, 'AUTH', '需要席位 Bearer token。');
          const scoped = parseScopedToken(seatToken) || fail(401, 'AUTH', '席位令牌无效。');
          if (scoped.gameId !== gameId) return fail(403, 'GAME_SCOPE', '席位令牌不能访问其他法庭。');
          const headers = { authorization: 'Bearer ' + seatToken };
          if (sub === 'agent' && method === 'GET') return jsonResponse(await roomJson(env, gameId, `/${gameId}/seat`, { headers }));
          if (sub === 'agent/wait' && method === 'GET') {
            const after = Number(url.searchParams.get('after') || 0);
            const timeoutQuery = Math.max(0, Math.min(Number(url.searchParams.get('timeout') ?? 15), 20));
            return jsonResponse(await roomJson(env, gameId, `/${gameId}/seat/wait?after=${after}&timeout=${timeoutQuery}`, { headers, signal: request.signal }));
          }
          if (sub === 'turns' && method === 'POST') return jsonResponse(await roomJson(env, gameId, `/${gameId}/seat/turns`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(await readBody(request)) }));
          if (sub === 'verdicts' && method === 'POST') return jsonResponse(await roomJson(env, gameId, `/${gameId}/seat/verdicts`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(await readBody(request)) }));
          return fail(405, 'METHOD', '不支持该方法。');
        }
        return fail(404, 'NOT_FOUND', '不存在的法庭接口。');
      }
      return fail(404, 'NOT_FOUND', '不存在的接口。');
    } catch (error) {
      return errorResponse(error);
    }
  },
};

function sameOriginGuard(request: Request, origin: string): void {
  const requestOrigin = request.headers.get('origin');
  if (requestOrigin && requestOrigin !== origin) return fail(403, 'ORIGIN', '不接受跨站请求。');
  if (request.headers.get('sec-fetch-site') === 'cross-site') return fail(403, 'ORIGIN', '不接受跨站请求。');
}
function scopeGame(token: string): string {
  return parseScopedToken(token)?.gameId || fail(401, 'AUTH', '席位令牌无效。');
}
