import type { IncomingMessage, ServerResponse } from 'node:http';

/** Transport only. The service owns all seats, turn validation and receipts. */
export interface McpCourtService {
  join(input: { ticket: string; agentName: string; clientActionId: string }): unknown;
  state(token: string): unknown;
  wait(token: string, input: { afterRevision: number; timeoutMs: number; signal?: AbortSignal }): Promise<unknown>;
  speak(token: string, input: { turnId: string; revision: number; clientActionId: string; payload: unknown }): unknown;
  prepareVerdicts(token: string, input: { clientActionId: string; plaintiff: unknown; defendant: unknown; revision?: number }): unknown;
}

const protocolVersion = '2025-11-25';
const string = { type: 'string', minLength: 1 };
const references = { type: 'array', items: string };
const emotion = { type: 'string', enum: ['normal', 'confident', 'angry', 'shocked', 'smug', 'sweating', 'gavel'] };
const ruling = { type: 'object', properties: {
  winner: { type: 'string', enum: ['plaintiff', 'defendant'] }, result: string,
  penalty: references, quote: string, reasons: references, evidenceIds: references, consideredInterventionIds: references,
}, required: ['winner', 'result', 'penalty', 'quote', 'reasons', 'evidenceIds', 'consideredInterventionIds'], additionalProperties: false };
const verdict = { type: 'object', properties: { text: string, emotion, responseTo: references, evidenceIds: references, ruling }, required: ['text', 'responseTo', 'evidenceIds', 'ruling'], additionalProperties: false };
const seatToken = { type: 'string', description: 'Only needed if this HTTP client cannot send Authorization: Bearer. Keep private. The Node stdio bridge stores it in memory.' };
function tool(name: string, description: string, properties: Record<string, unknown>, required: string[] = [], readOnlyHint = false) {
  return { name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false }, annotations: { readOnlyHint, destructiveHint: false, idempotentHint: true, openWorldHint: false } };
}
export const courtMcpTools = [
  tool('court_join', 'Claim the one seat granted by your invitation. Read the fixed guide and your role rules first. Reuse clientActionId on uncertain retries.', { ticket: string, agentName: string, clientActionId: string }, ['ticket', 'agentName', 'clientActionId']),
  tool('court_state', 'Read your authorized public case, current turn, own receipts and roleFinished. roleFinished is not a final case verdict.', { seatToken }, [], true),
  tool('court_wait', 'Wait for a public revision, then return current state. Maximum 15 seconds. Stop when roleFinished is true; the server handles later human votes.', { seatToken, afterRevision: { type: 'integer', minimum: 0 }, timeoutMs: { type: 'integer', minimum: 0, maximum: 15000 } }, ['afterRevision'], true),
  tool('court_speak', 'Submit only your current public turn. Your token fixes your role. Use actual references and a stable clientActionId; stale turns are rejected.', { seatToken, turnId: string, revision: { type: 'integer', minimum: 0 }, clientActionId: string, text: string, emotion, responseTo: references, evidenceIds: references }, ['turnId', 'revision', 'clientActionId', 'text', 'responseTo', 'evidenceIds']),
  tool('court_prepare_verdicts', 'Judge only, after the ten public rounds: seal one reasoned verdict for each possible human jury winner. Both remain private until the server publishes the winning one. After acceptance the judge can finish.', { seatToken, revision: { type: 'integer', minimum: 0 }, clientActionId: string, plaintiff: verdict, defendant: verdict }, ['clientActionId', 'plaintiff', 'defendant']),
];

function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, any>;
}
function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 10000) throw new Error(`${name} must be a nonempty string`);
  return value;
}
function integer(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${name} must be a nonnegative integer`);
  return value as number;
}
function ids(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length > 200 || value.some(item => typeof item !== 'string' || !item || item.length > 200)) throw new Error(`${name} must contain reference IDs`);
  return value;
}
function json(res: ServerResponse, status: number, value?: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(value === undefined ? undefined : JSON.stringify(value));
}

export function createCourtMcpHandler({ service, publicBaseUrl, allowedOrigins = [] }: { service: McpCourtService; publicBaseUrl?: string; allowedOrigins?: string[] }) {
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let id: unknown = null;
    const error = (code: number, message: string, status = 200) => json(res, status, { jsonrpc: '2.0', id, error: { code, message } });
    const origin = req.headers.origin;
    const requestOrigin = `${'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
    // Never trust an arbitrary Host header to bless an Origin (DNS rebinding).
    let localOrigin: string[] = [];
    try { if (['localhost', '127.0.0.1', '[::1]'].includes(new URL(requestOrigin).hostname)) localOrigin = [requestOrigin]; } catch { /* invalid host cannot grant an origin */ }
    const origins = new Set([...allowedOrigins, ...(publicBaseUrl ? [new URL(publicBaseUrl).origin] : localOrigin)]);
    if (origin && !origins.has(origin)) { error(-32001, 'Origin is not allowed', 403); return; }
    if (req.method !== 'POST') { res.setHeader('allow', 'POST'); error(-32000, 'This stateless MCP endpoint accepts POST only', 405); return; }
    if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') { error(-32600, 'Content-Type must be application/json', 415); return; }
    const accept = req.headers.accept || '';
    if (!accept.includes('application/json') || !accept.includes('text/event-stream')) { error(-32600, 'Accept must include application/json and text/event-stream', 406); return; }
    const version = req.headers['mcp-protocol-version'];
    if (version && version !== protocolVersion && version !== '2025-06-18' && version !== '2025-03-26') { error(-32600, 'Unsupported MCP protocol version', 400); return; }
    let request: Record<string, any>;
    try {
      let size = 0; const parts: Buffer[] = [];
      for await (const chunk of req) { size += chunk.length; if (size > 128000) { error(-32600, 'Message too large', 413); return; } parts.push(chunk); }
      try { request = object(JSON.parse(Buffer.concat(parts).toString('utf8'))); } catch { error(-32700, 'Invalid JSON message', 400); return; }
      if ('id' in request) id = request.id;
      if (request.jsonrpc !== '2.0' || typeof request.method !== 'string' || ('id' in request && typeof id !== 'string' && typeof id !== 'number')) { error(-32600, 'Invalid JSON-RPC request', 400); return; }
      if (!('id' in request)) { json(res, 202); return; }
      let result: unknown;
      if (request.method === 'initialize') {
        const requested = request.params?.protocolVersion;
        result = { protocolVersion: ['2025-03-26', '2025-06-18', protocolVersion].includes(requested) ? requested : protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'internet-court', version: '1.0.0' }, instructions: `Read ${publicBaseUrl || requestOrigin}/agents/guide.md before joining. Each invitation grants exactly one role; humans alone vote. No OAuth flow is required: join with the invitation capability, then send the returned seatToken as Authorization: Bearer.` };
      } else if (request.method === 'ping') result = {};
      else if (request.method === 'tools/list') result = { tools: courtMcpTools };
      else if (request.method === 'tools/call') {
        const params = object(request.params); const args = object(params.arguments || {});
        const definition = courtMcpTools.find(item => item.name === params.name);
        if (!definition) { error(-32602, 'Unknown court tool'); return; }
        try {
          for (const key of Object.keys(args)) if (!(key in definition.inputSchema.properties)) throw new Error(`Unexpected argument: ${key}`);
          for (const key of definition.inputSchema.required) if (!(key in args)) throw new Error(`Missing argument: ${key}`);
          const auth = req.headers.authorization;
          const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : args.seatToken;
          if (params.name !== 'court_join') requiredString(token, 'seatToken / Authorization Bearer');
          let value: unknown;
          if (params.name === 'court_join') value = await service.join({ ticket: requiredString(args.ticket, 'ticket'), agentName: requiredString(args.agentName, 'agentName'), clientActionId: requiredString(args.clientActionId, 'clientActionId') });
          else if (params.name === 'court_state') value = await service.state(token);
          else if (params.name === 'court_wait') {
            const timeoutMs = args.timeoutMs === undefined ? 15000 : integer(args.timeoutMs, 'timeoutMs');
            if (timeoutMs > 15000) throw new Error('timeoutMs cannot exceed 15000');
            const controller = new AbortController(); const disconnect = () => controller.abort();
            res.once('close',disconnect);
            try { value = await service.wait(token, { afterRevision: integer(args.afterRevision, 'afterRevision'), timeoutMs, signal:controller.signal }); }
            finally { res.removeListener('close',disconnect); }
          } else if (params.name === 'court_speak') {
            if (args.emotion !== undefined && !emotion.enum.includes(args.emotion)) throw new Error('Invalid emotion');
            value = await service.speak(token, { turnId: requiredString(args.turnId, 'turnId'), revision: integer(args.revision, 'revision'), clientActionId: requiredString(args.clientActionId, 'clientActionId'), payload: { text: requiredString(args.text, 'text'), ...(args.emotion ? { emotion: args.emotion } : {}), responseTo: ids(args.responseTo, 'responseTo'), evidenceIds: ids(args.evidenceIds, 'evidenceIds') } });
          } else {
            value = await service.prepareVerdicts(token, { clientActionId: requiredString(args.clientActionId, 'clientActionId'), ...(args.revision === undefined ? {} : { revision: integer(args.revision, 'revision') }), plaintiff: { ...object(args.plaintiff), speaker: 'judge' }, defendant: { ...object(args.defendant), speaker: 'judge' } });
          }
          result = { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value, isError: false };
        } catch (cause) {
          const failure = cause instanceof Error ? cause.message : 'Court action failed';
          result = { content: [{ type: 'text', text: failure }], isError: true };
        }
      } else { error(-32601, 'Method not found'); return; }
      if (!res.destroyed && !res.writableEnded) json(res, 200, { jsonrpc: '2.0', id, result });
    } catch { if (!res.writableEnded) error(-32603, 'Court transport failed', 500); }
  };
}
