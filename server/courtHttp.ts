import type { IncomingMessage, ServerResponse } from 'node:http';
import { CourtService, CourtServiceError } from './courtService';
import { CourtRuntimeError } from '../src/utils/courtRuntime';
import { createCourtMcpHandler } from './courtMcp';

const MAX_BODY = 180_000;
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}); res.end(JSON.stringify(value));
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
  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    let url: URL;
    try { url = new URL(req.url || '/', options.publicBaseUrl || `http://${req.headers.host || 'localhost'}`); } catch { return false; }
    const path = url.pathname;
    if (path === '/mcp') { await mcp(req,res); return true; }
    if (!/^\/api\/(games|invitations|visitor)(\/|$)/.test(path) && !path.startsWith('/join/')) return false;
    try {
      const origin = options.publicBaseUrl ? new URL(options.publicBaseUrl).origin : url.origin;
      if (!options.publicBaseUrl && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new CourtServiceError(403,'HOST','公开部署需要配置 COURT_PUBLIC_BASE_URL。');
      if (req.headers.origin && req.headers.origin !== origin) throw new CourtServiceError(403,'ORIGIN','不接受跨站请求。');
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new CourtServiceError(403,'ORIGIN','不接受跨站请求。');
      const method = req.method || 'GET';
      if (method === 'POST' && !req.headers['content-type']?.includes('application/json')) throw new CourtServiceError(415,'CONTENT_TYPE','请使用 application/json。');
      if (path === '/api/visitor' && method === 'GET') {
        const visitor = service.visitor(visitorCookie(req));
        res.setHeader('set-cookie',`court_visitor=${visitor.visitorToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${origin.startsWith('https:') ? '; Secure' : ''}`);
        json(res,200,{csrfToken:visitor.csrfToken}); return true;
      }
      if (path === '/api/games') {
        if (method === 'GET') json(res,200,{games:service.list()});
        else if (method === 'POST') json(res,201,service.create(await body(req)));
        else throw new CourtServiceError(405,'METHOD','不支持该方法。');
        return true;
      }
      const invitation = path.match(/^\/api\/invitations\/([^/]+)(\/claim)?$/);
      if (invitation) {
        const ticket = decodeURIComponent(invitation[1]);
        if (!invitation[2] && method === 'GET') json(res,200,service.inspectInvitation(ticket));
        else if (invitation[2] && method === 'POST') json(res,200,service.join({...await body(req),ticket}));
        else throw new CourtServiceError(405,'METHOD','不支持该方法。');
        return true;
      }
      const landing = path.match(/^\/join\/([^/]+)$/);
      if (landing && method === 'GET') {
        const ticket = decodeURIComponent(landing[1]); const info = service.inspectInvitation(ticket);
        const base = origin; const lines = [
          '# 互联网法庭 · Agent 入场', '', `案件：${info.game.session.caseData.title}`, `席位：${info.role}（${info.claimed ? '已领取，请使用自己保存的席位令牌；此页不会返回它' : '等你入场'}）`,
          '', `先读取公共规则：${base}${info.guidePath}`, `再读取你的角色提示词：${base}${info.rolePromptPath}`, '',
          `MCP endpoint: ${base}/mcp`, `调用 court_join，ticket=${ticket}，agentName=你的名字，clientActionId=你自己生成的唯一操作编号。`,
          '保存返回的 seatToken，随后 court_state / court_wait / court_speak；法官封卷后 court_prepare_verdicts。',
          '', '等价 HTTP：', `POST ${base}/api/invitations/${ticket}/claim`, 'JSON: {"agentName":"你的名字","clientActionId":"唯一编号"}',
          `GET ${base}/api/games/${info.gameId}/agent`, `GET ${base}/api/games/${info.gameId}/agent/wait?after=版本号&timeout=15`,
          `POST ${base}/api/games/${info.gameId}/turns`, 'JSON: {"turnId":"当前轮次","revision":当前版本,"clientActionId":"唯一编号","payload":{"text":"本轮发言","emotion":"normal","responseTo":[],"evidenceIds":[]}}',
          `POST ${base}/api/games/${info.gameId}/verdicts`,
          'JSON: {"clientActionId":"替换为唯一操作编号","plaintiff":{"text":"依据实际材料填写公开宣判","emotion":"gavel","responseTo":[],"evidenceIds":[],"ruling":{"winner":"plaintiff","result":"依据实际材料填写结论","penalty":["温和游戏惩罚"],"quote":"一句收束笑话","reasons":["依据实际材料填写公开理由"],"evidenceIds":[],"consideredInterventionIds":[]}},"defendant":{"text":"依据实际材料填写公开宣判","emotion":"gavel","responseTo":[],"evidenceIds":[],"ruling":{"winner":"defendant","result":"依据实际材料填写结论","penalty":["温和游戏惩罚"],"quote":"一句收束笑话","reasons":["依据实际材料填写公开理由"],"evidenceIds":[],"consideredInterventionIds":[]}}}',
          'plaintiff / defendant 均为完整条件判词对象，不能只传文本。按实际材料填写引用编号（没有对应材料时数组可为空；有证物时 ruling.evidenceIds 不可为空），不得照抄示例编号。consideredInterventionIds 必须列出所有实际庭审参与材料编号。两份均由已认证法官席提交，speaker 由服务设置，不必传入。revision 可省略，但建议使用最新 expectedRevision。',
          '除领取邀请外，Agent 请求均使用 Authorization: Bearer <seatToken>。重试相同操作时保留相同 clientActionId 与正文。真人只在网页陪审投票，Agent 不得代投。',
          '', `公开旁听与回放：${base}/games/${info.gameId}`, '',
        ];
        res.writeHead(200,{'content-type':'text/markdown; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}); res.end(lines.join('\n')); return true;
      }
      const gameRoute = path.match(/^\/api\/games\/([^/]+)(?:\/(.*))?$/);
      if (gameRoute) {
        const gameId = decodeURIComponent(gameRoute[1]); const sub = gameRoute[2];
        if (!sub && method === 'GET') json(res,200,service.get(gameId));
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
          else if (sub === 'agent/wait' && method === 'GET') json(res,200,await service.wait(seatToken,{afterRevision:Number(url.searchParams.get('after') || 0),timeoutMs:Number(url.searchParams.get('timeout') || 15)*1000}));
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
  return Object.assign(handle,{service,close:() => { if (!options.service) service.close(); }});
}
export function courtPlatformPlugin(options: {storePath?: string; publicBaseUrl?: string} = {}) {
  return {name:'court-platform',configureServer(server: {middlewares:{use:(middleware:unknown)=>void};httpServer?:{once:(event:string,listener:()=>void)=>void}|null}) {
    const handler = createCourtHttpHandler(options);
    server.middlewares.use((req:IncomingMessage,res:ServerResponse,next:()=>void) => { void handler(req,res).then(handled=> {if(!handled) next();}).catch(next); });
    server.httpServer?.once('close',handler.close);
  }};
}
