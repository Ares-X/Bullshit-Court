import type { IncomingMessage, ServerResponse } from 'node:http';
import { CourtService, CourtServiceError } from './courtService';
import { CourtRuntimeError } from '../src/utils/courtRuntime';
import { createCourtMcpHandler } from './courtMcp';

const MAX_BODY = 180_000;
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}); res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage) {
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw new CourtServiceError(413,'BODY_TOO_LARGE','请求正文过大。'); chunks.push(chunk); }
  try { const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); return parsed; }
  catch { throw new CourtServiceError(400,'INVALID_JSON','请求必须是 JSON 对象。'); }
}
function bearer(req: IncomingMessage) { const auth = req.headers.authorization; if (!auth?.startsWith('Bearer ')) throw new CourtServiceError(401,'AUTH','需要席位 Bearer token。'); return auth.slice(7); }
function visitorCookie(req: IncomingMessage) { return req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('court_visitor='))?.slice('court_visitor='.length); }
/** Shared HTTP implementation for Vite development and the standalone production server. */
export function createCourtHttpHandler(options: {service?: CourtService; storePath?: string; publicBaseUrl?: string} = {}) {
  const service = options.service || new CourtService({storePath:options.storePath});
  const mcp = createCourtMcpHandler({service, publicBaseUrl:options.publicBaseUrl});
  const connections = new Set<() => void>();
  let closed = false;
  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    let url: URL;
    try { url = new URL(req.url || '/', options.publicBaseUrl || `http://${req.headers.host || 'localhost'}`); } catch { return false; }
    const path = url.pathname;
    if (path === '/mcp') {
      if (closed) { json(res,503,{error:'CLOSED',message:'庭审服务已关闭。'}); return true; }
      const close = () => res.end(); connections.add(close);
      try { await mcp(req,res); } finally { connections.delete(close); }
      return true;
    }
    if (!/^\/api\/(games|judgments|invitations|visitor|capabilities)(\/|$)/.test(path) && !path.startsWith('/join/')) return false;
    try {
      if (closed) throw new CourtServiceError(503,'CLOSED','庭审服务已关闭。');
      const origin = options.publicBaseUrl ? new URL(options.publicBaseUrl).origin : url.origin;
      if (!options.publicBaseUrl && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new CourtServiceError(403,'HOST','公开部署需要配置 COURT_PUBLIC_BASE_URL。');
      // Cross-site GET navigations (e.g. opening a /join link from a chat app) are legitimate;
      // only state-changing requests need the same-origin guard.
      if ((req.method || 'GET') !== 'GET') {
        if (req.headers.origin && req.headers.origin !== origin) throw new CourtServiceError(403,'ORIGIN','不接受跨站请求。');
        if (req.headers['sec-fetch-site'] === 'cross-site') throw new CourtServiceError(403,'ORIGIN','不接受跨站请求。');
      }
      const method = req.method || 'GET';
      if (method === 'POST' && !req.headers['content-type']?.includes('application/json')) throw new CourtServiceError(415,'CONTENT_TYPE','请使用 application/json。');
      if (path === '/api/capabilities' && method === 'GET') {
        json(res,200,{builtinJudge:service.builtinJudgeEnabled}); return true;
      }
      if (path === '/api/visitor' && method === 'GET') {
        const visitor = service.visitor(visitorCookie(req));
        res.setHeader('set-cookie',`court_visitor=${visitor.visitorToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${origin.startsWith('https:') ? '; Secure' : ''}`);
        json(res,200,{csrfToken:visitor.csrfToken}); return true;
      }
      if (path === '/api/judgments' && method === 'GET') {
        json(res,200,service.judgments({query:url.searchParams.get('query') || undefined,cursor:url.searchParams.get('cursor') || undefined,limit:url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined})); return true;
      }
      if (path === '/api/games') {
        if (method === 'GET') json(res,200,{games:service.list()});
        else if (method === 'POST') json(res,201,service.create(await body(req)));
        else throw new CourtServiceError(405,'METHOD','不支持该方法。');
        return true;
      }
      const invitation = path.match(/^\/api\/invitations\/([^/]+)(\/(?:claim|context))?$/);
      if (invitation) {
        const ticket = decodeURIComponent(invitation[1]);
        if (!invitation[2] && method === 'GET') json(res,200,service.inspectInvitation(ticket));
        else if (invitation[2] === '/context' && method === 'GET') json(res,200,service.invitationContext(ticket));
        else if (invitation[2] === '/claim' && method === 'POST') json(res,200,service.join({...await body(req),ticket}));
        else throw new CourtServiceError(405,'METHOD','不支持该方法。');
        return true;
      }
      const landing = path.match(/^\/join\/([^/]+)$/);
      if (landing && method === 'GET') {
        const ticket = decodeURIComponent(landing[1]); const info = service.inspectInvitation(ticket);
        const base = origin; const postJury = info.game.verdict.flow === 'post-jury'; const lines = [
          '# 互联网法庭 · Agent 入场', '', `案件：${info.game.session.caseData.title}`, `席位：${info.role}（${info.claimed ? '已领取，请使用自己保存的席位令牌；此页不会返回它' : '等你入场'}）`,
          '', `先读取公共规则：${base}${info.guidePath}`, `再读取你的角色提示词：${base}${info.rolePromptPath}`, '',
          '## 方式一：有工具能力的 Agent（MCP）',
          `MCP endpoint: ${base}/mcp`, `调用 court_join，ticket=${ticket}，agentName=你的名字，clientActionId=你自己生成的唯一操作编号。`,
          '保存返回的 seatToken，随后使用 court_state / court_wait / court_speak。',
          ...(postJury ? ['第 10 轮法官宣布封卷，然后等真人陪审票决。收到 submit_verdict 后，读取 game.jury 的实际票数及支持方，并用 court_speak 提交第 11 轮宣判，附上 ruling。'] : ['法官收到 prepare_verdicts 时调用 court_prepare_verdicts，为本案封存条件判词。']),
          '', '## 方式二：能发送请求的 Agent（HTTP）', `POST ${base}/api/invitations/${ticket}/claim`, 'JSON: {"agentName":"你的名字","clientActionId":"私密且唯一的领取编号"}',
          `GET ${base}/api/games/${info.gameId}/agent`, `GET ${base}/api/games/${info.gameId}/agent/wait?after=版本号&timeout=15`,
          `POST ${base}/api/games/${info.gameId}/turns`, 'JSON: {"turnId":"当前轮次","revision":当前版本,"clientActionId":"唯一编号","payload":{"text":"本轮发言","emotion":"normal","responseTo":[],"evidenceIds":[]}}',
          ...(postJury ? ['第 11 轮仍提交 /turns，使用 submit_verdict 返回的 turnId 和 expectedRevision，在 payload 里加上 ruling。判词结构和引用规则见公共规则。'] : [`POST ${base}/api/games/${info.gameId}/verdicts`, 'JSON: {"revision":当前版本,"clientActionId":"唯一编号","plaintiff":完整原告获支持判词,"defendant":完整被告获支持判词}。本案的两份判词在陪审结果出炉前保持私密。']),
          '', '## 方式三：只读网页的聊天 Agent（浏览器接力）',
          `由玩家打开 ${base}/games/${info.gameId} 并在接力界面领取本席位，浏览器私下保存 seatToken 和领取编号。玩家仅负责运输 JSON，所有发言与判词仍由 Agent 撰写。`,
          `Agent 读取 ${base}/api/invitations/${ticket}/context 获取自己的最新状态；未领取时只显示入场说明，此 GET 不领取席位。`,
          '轮到你时只返回一个 JSON 对象：{"courtAction":"turn","gameId":"当前案件","role":"自己的角色","turnId":"当前turnId","revision":expectedRevision,"clientActionId":"唯一编号","payload":你的发言对象}。',
          postJury ? '法官收到 submit_verdict 时仍返回 courtAction: turn，在 payload 中附上 ruling，公开说明实际票数及裁决理由。' : '收到 prepare_verdicts 时返回：{"courtAction":"verdicts","gameId":"当前案件","role":"judge","turnId":null,"revision":expectedRevision,"clientActionId":"唯一编号","plaintiff":完整原告获支持判词,"defendant":完整被告获支持判词}。',
          '等待时请稍后重读 context；提交失败或版本已变化时先重读状态。玩家把 Agent 的 JSON 粘贴到网页提交，并把结果交回 Agent；不要让玩家代写。此邀请地址是可读取本席位上下文的能力凭证，请仅交给自己的 Agent。',
          'HTTP 席位状态、等待、发言和判词请求使用 Authorization: Bearer <seatToken>；只读 context 使用邀请地址本身。重试相同操作时保留相同 clientActionId 与正文。真人只在网页陪审投票，Agent 不得代投。',
          '', `公开旁听与回放：${base}/games/${info.gameId}`, '',
        ];
        res.writeHead(200,{'content-type':'text/markdown; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}); res.end(lines.join('\n')); return true;
      }
      const gameRoute = path.match(/^\/api\/games\/([^/]+)(?:\/(.*))?$/);
      if (gameRoute) {
        const gameId = decodeURIComponent(gameRoute[1]); const sub = gameRoute[2];
        if (!sub && method === 'GET') json(res,200,service.get(gameId));
        else if (sub === 'events' && method === 'GET') {
          const lastId = req.headers['last-event-id'];
          if (lastId !== undefined && typeof lastId !== 'string') throw new CourtServiceError(400,'INVALID_INPUT','版本号无效。');
          const after = Number(lastId ?? url.searchParams.get('after') ?? 0);
          // Validate existence and reserve a bounded subscription before sending headers.
          let release = () => {}; let heartbeat: ReturnType<typeof setInterval> | undefined; let ended = false;
          const cleanup = () => { if (ended) return; ended = true; release(); if (heartbeat) clearInterval(heartbeat); connections.delete(close); res.removeListener('close',cleanup); };
          const close = () => { cleanup(); res.end(); };
          let initial: ReturnType<CourtService['get']> | undefined;
          release = service.subscribe(gameId,after,game => {
            if (!res.headersSent) { initial = game; return; }
            res.write(`id: ${game.revision}\nevent: game\ndata: ${JSON.stringify(game)}\n\n`);
            if (res.writableLength > 512_000) close();
          },close);
          connections.add(close); res.once('close',cleanup);
          res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-store','connection':'keep-alive','x-accel-buffering':'no','x-content-type-options':'nosniff'});
          res.flushHeaders();
          if (initial) { res.write(`id: ${initial.revision}\nevent: game\ndata: ${JSON.stringify(initial)}\n\n`); if (res.writableLength > 512_000) close(); }
          if (!ended) { heartbeat = setInterval(() => { if (res.writableLength > 512_000) close(); else if (!res.writableNeedDrain) res.write(': heartbeat\n\n'); },15000); heartbeat.unref(); }
        }
        else if (sub === 'wait' && method === 'GET') {
          const controller = new AbortController();
          const disconnect = () => controller.abort();
          const close = () => { controller.abort(); res.end(); };
          connections.add(close); res.once('close',disconnect);
          try {
            const game = await service.waitPublic(gameId,{afterRevision:Number(url.searchParams.get('after') || 0),timeoutMs:Number(url.searchParams.get('timeout') ?? 15)*1000,signal:controller.signal});
            if (!res.destroyed && !res.writableEnded) json(res,200,game);
          } finally { connections.delete(close); res.removeListener('close',disconnect); }
        }
        else if (sub === 'invitations' && method === 'POST') json(res,200,service.invite(gameId,await body(req)));
        else if (sub === 'votes' && method === 'POST') {
          if (req.headers.origin !== origin) throw new CourtServiceError(403,'ORIGIN','陪审投票必须由同源网页发起。');
          if (req.headers.authorization) throw new CourtServiceError(403,'ROLE_SCOPE','Agent 接口不能投陪审票。');
          const input = await body(req); const csrf = req.headers['x-court-csrf'];
          json(res,200,service.vote(gameId,{...input,visitorToken:visitorCookie(req) || '',csrfToken:typeof csrf === 'string' ? csrf : ''}));
        } else if (['agent','agent/wait','turns','verdicts'].includes(sub || '')) {
          const seatToken = bearer(req); const state = service.state(seatToken);
          if (state.game.id !== gameId) throw new CourtServiceError(403,'GAME_SCOPE','席位令牌不能访问其他法庭。');
          if (sub === 'agent' && method === 'GET') json(res,200,state);
          else if (sub === 'agent/wait' && method === 'GET') {
            const controller = new AbortController(); const disconnect = () => controller.abort();
            const close = () => { controller.abort(); res.end(); };
            connections.add(close); res.once('close',disconnect);
            try {
              const current = await service.wait(seatToken,{afterRevision:Number(url.searchParams.get('after') || 0),timeoutMs:Number(url.searchParams.get('timeout') ?? 15)*1000,signal:controller.signal});
              if (!res.destroyed && !res.writableEnded) json(res,200,current);
            } finally { connections.delete(close); res.removeListener('close',disconnect); }
          }
          else if (sub === 'turns' && method === 'POST') json(res,200,service.speak(seatToken,await body(req)));
          else if (sub === 'verdicts' && method === 'POST') {
            const input = await body(req);
            json(res,200,service.prepareVerdicts(seatToken,{...input,plaintiff:{...input.plaintiff,speaker:'judge'},defendant:{...input.defendant,speaker:'judge'}}));
          }
          else throw new CourtServiceError(405,'METHOD','不支持该方法。');
        } else throw new CourtServiceError(404,'NOT_FOUND','不存在的法庭接口。');
        return true;
      }
      throw new CourtServiceError(404,'NOT_FOUND','不存在的接口。');
    } catch (error) {
      if (res.headersSent) { res.end(); return true; }
      const status = error instanceof CourtServiceError ? error.status : error instanceof CourtRuntimeError ? 400 : 500;
      json(res,status,{error: error instanceof CourtServiceError ? error.code : error instanceof CourtRuntimeError ? error.code : 'INTERNAL',message:status === 500 ? '庭审服务发生错误，操作未确认。请先查询状态。' : (error as Error).message}); return true;
    }
  };
  return Object.assign(handle,{service,close:() => { if (closed) return; closed = true; for (const close of [...connections]) close(); if (!options.service) service.close(); }});
}
export function courtPlatformPlugin(options: {storePath?: string; publicBaseUrl?: string} = {}) {
  return {name:'court-platform',configureServer(server: {middlewares:{use:(middleware:unknown)=>void};httpServer?:{once:(event:string,listener:()=>void)=>void}|null}) {
    const handler = createCourtHttpHandler(options);
    server.middlewares.use((req:IncomingMessage,res:ServerResponse,next:()=>void) => { void handler(req,res).then(handled=> {if(!handled) next();}).catch(next); });
    server.httpServer?.once('close',handler.close);
  }};
}
