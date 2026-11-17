import { randomBytes, timingSafeEqual } from 'node:crypto';

const MAX_BODY = 250_000;
const ROLES = ['judge', 'plaintiff', 'defendant'];
const SHOUTS = ['OBJECTION', 'HOLD_IT', 'TAKE_THAT', 'ORDER'];
const loopback = value => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(value);
const text = (value, max = 40_000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
function clean(value, depth = 0) {
  if (depth > 20) throw new Error('Snapshot nesting exceeds limit');
  if (Array.isArray(value)) { if (value.length > 600) throw new Error('Snapshot list exceeds limit'); return value.map(item => clean(item, depth + 1)); }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/api.?key|token|secret|password|authorization|agentThought/i.test(key)).map(([key, item]) => [key, clean(item, depth + 1)]));
  return value;
}
function snapshot(value) {
  if (!value || value.version !== 1 || !text(value.id, 150) || !value.caseData || !Array.isArray(value.turns) || !Array.isArray(value.evidences)) throw new Error('Invalid court session snapshot');
  return clean(value);
}
export function validateCourtCommand(value) {
  if (!value || !ROLES.includes(value.role)) throw new Error('Only judge, plaintiff and defendant are court agents');
  if (value.type === 'argument' && text(value.text) && (!value.shout || SHOUTS.includes(value.shout))) {
    const refs = key => Array.isArray(value[key]) && value[key].length <= 100 && value[key].every(id => text(id, 150)) ? value[key] : [];
    return { responseTo: refs('responseTo'), evidenceIds: refs('evidenceIds'), type: 'argument', role: value.role, text: value.text, ...(text(value.speakerName, 120) ? { speakerName: value.speakerName } : {}), ...(value.shout ? { shout: value.shout } : {}) };
  }
  const ev = value.evidence;
  if (value.type === 'evidence' && ['plaintiff', 'defendant'].includes(value.role) && ev && text(ev.id, 150) && text(ev.name, 500) && text(ev.description) && text(ev.icon, 100) && ev.owner === value.role) return { type: 'evidence', role: value.role, evidence: { id: ev.id, name: ev.name, description: ev.description, icon: ev.icon, owner: ev.owner } };
  const r = value.ruling;
  const strings = list => Array.isArray(list) && list.length <= 100 && list.every(item => text(item, 5000));
  if (value.type === 'ruling' && value.role === 'judge' && r && ['plaintiff', 'defendant', 'draw'].includes(r.winner) && text(r.result) && typeof r.quote === 'string' && r.quote.length <= 5000 && ['penalty', 'reasons', 'evidenceIds', 'consideredInterventionIds'].every(key => strings(r[key]))) return { responseTo: Array.isArray(value.responseTo) && value.responseTo.every(id => text(id, 150)) ? value.responseTo : [], evidenceIds: r.evidenceIds, type: 'ruling', role: 'judge', ruling: { winner: r.winner, result: r.result, penalty: r.penalty, quote: r.quote, reasons: r.reasons, evidenceIds: r.evidenceIds, consideredInterventionIds: r.consideredInterventionIds } };
  throw new Error('Invalid command payload');
}
async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) { const error = new Error('Request body too large'); error.status = 413; throw error; } chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { const error = new Error('Invalid JSON'); error.status = 400; throw error; }
}
/** A process-local bridge. It never executes commands or invents court state. */
export function createCourtBridgeHandler({ now = Date.now, sessionTtlMs = 3_600_000, connectionTtlMs = 15_000 } = {}) {
  const sessions = new Map();
  const handler = async (req, res, next) => {
    let url; try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); } catch { next?.(); return false; }
    if (!url.pathname.startsWith('/api/court')) { next?.(); return false; }
    const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(body)); };
    try {
      const hostname = url.hostname.replace(/^\[|\]$/g, '');
      if (!loopback(req.socket.remoteAddress) || !['localhost', '127.0.0.1', '::1'].includes(hostname)) { reply(403, { error: 'Court bridge is available on loopback only' }); return true; }
      if (req.headers.origin && req.headers.origin !== `${url.protocol}//${url.host}`) { reply(403, { error: 'Cross-origin court bridge requests are forbidden' }); return true; }
      for (const [id, session] of sessions) if (now() - session.lastAccess > sessionTtlMs) sessions.delete(id);
      if (url.pathname === '/api/court/sessions' && req.method === 'POST') {
        if (sessions.size >= 32) { reply(429, { error: 'Too many local court sessions' }); return true; }
        const registered = await readBody(req); const state = snapshot(registered.snapshot);
        const sessionId = randomBytes(16).toString('hex'); const token = randomBytes(32).toString('hex');
        sessions.set(sessionId, { token, snapshot: state, agentRequest: clean(registered.agentRequest ?? null), commands: [], lastAccess: now(), lastBrowserAt: now() });
        reply(201, { sessionId, token }); return true;
      }
      const match = url.pathname.match(/^\/api\/court\/sessions\/([a-f0-9]{32})(?:\/(state|commands)(?:\/([a-f0-9]{24}))?)?$/);
      const session = match && sessions.get(match[1]);
      if (!session) { reply(404, { error: 'Court browser session is not connected' }); return true; }
      const supplied = req.headers['x-court-token'];
      if (typeof supplied !== 'string' || supplied.length !== session.token.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(session.token))) { reply(401, { error: 'Court session token required' }); return true; }
      session.lastAccess = now();
      const connected = () => now() - session.lastBrowserAt < connectionTtlMs;
      if (!match[2] && req.method === 'DELETE') { sessions.delete(match[1]); reply(200, { status: 'disconnected' }); return true; }
      if (match[2] === 'state' && req.method === 'GET') { reply(200, { connected: connected(), snapshot: session.snapshot, agentRequest: session.agentRequest, commands: session.commands.map(({ id, status, error }) => ({ id, status, ...(error ? { error } : {}) })) }); return true; }
      if (match[2] === 'state' && req.method === 'PUT') { const published = await readBody(req); session.snapshot = snapshot(published.snapshot); session.agentRequest = clean(published.agentRequest ?? null); session.lastBrowserAt = now(); reply(200, { status: 'published' }); return true; }
      if (match[2] === 'commands' && !match[3] && req.method === 'POST') {
        if (!connected()) { reply(409, { error: 'Court browser is disconnected; command was not queued' }); return true; }
        if (session.commands.filter(c => c.status === 'queued').length >= 50) { reply(429, { error: 'Court command queue is full' }); return true; }
        const validated = validateCourtCommand(await readBody(req));
        if (validated.type === 'ruling' && (!session.snapshot.juryVote || validated.ruling.winner !== session.snapshot.juryVote)) { reply(409, { error: 'A ruling must follow and match the recorded jury decision' }); return true; }
        const command = { ...validated, id: randomBytes(12).toString('hex'), status: 'queued' };
        session.commands.push(command); if (session.commands.length > 200) session.commands.splice(0, session.commands.length - 200);
        reply(202, { status: 'queued', commandId: command.id, message: 'Queued for the connected browser; not yet applied' }); return true;
      }
      if (match[2] === 'commands' && !match[3] && req.method === 'GET') { session.lastBrowserAt = now(); reply(200, { commands: session.commands.filter(c => c.status === 'queued').map(({ status, ...command }) => command) }); return true; }
      if (match[3] && req.method === 'PUT') {
        const command = session.commands.find(c => c.id === match[3]); if (!command) { reply(404, { error: 'Command not found' }); return true; }
        const result = await readBody(req); if (!['applied', 'rejected'].includes(result.status)) { reply(400, { error: 'Invalid command result' }); return true; }
        command.status = result.status; if (result.status === 'rejected') command.error = String(result.error || 'Browser rejected command').slice(0, 1000);
        reply(200, { status: command.status }); return true;
      }
      reply(405, { error: 'Unsupported court bridge operation' }); return true;
    } catch (error) { reply(error.status || 400, { error: error.message || 'Court bridge request failed' }); return true; }
  };
  handler.close = () => sessions.clear();
  return handler;
}
export function courtBridgePlugin() {
  const handler = createCourtBridgeHandler();
  return { name: 'local-court-bridge', configureServer(server) { server.middlewares.use((req, res, next) => { void handler(req, res, next); }); server.httpServer?.once('close', handler.close); }, configurePreviewServer(server) { server.middlewares.use((req, res, next) => { void handler(req, res, next); }); server.httpServer?.once('close', handler.close); } };
}
