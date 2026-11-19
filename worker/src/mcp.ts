/**
 * Stateless MCP endpoint for Workers. Transport layer only: every tool call is
 * routed to the owning CourtRoom object via the deps callbacks in index.ts.
 * Tool schemas and validation mirror server/courtMcp.ts; the two must stay in sync.
 */
const protocolVersion = '2025-11-25';
const string = { type: 'string', minLength: 1 };
const references = { type: 'array', items: string };
const emotion = { type: 'string', enum: ['normal', 'confident', 'angry', 'shocked', 'smug', 'sweating', 'gavel'] };
const ruling = { type: 'object', properties: {
  winner: { type: 'string', enum: ['plaintiff', 'defendant'] }, result: string,
  penalty: references, quote: string, reasons: references, evidenceIds: references, consideredInterventionIds: references,
}, required: ['winner', 'result', 'penalty', 'quote', 'reasons', 'evidenceIds', 'consideredInterventionIds'], additionalProperties: false };
const verdict = { type: 'object', properties: { text: string, emotion, responseTo: references, evidenceIds: references, ruling }, required: ['text', 'responseTo', 'evidenceIds', 'ruling'], additionalProperties: false };
const seatToken = { type: 'string', description: 'Only needed if this HTTP client cannot send Authorization: Bearer. Keep private.' };
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

export interface McpCourtDeps {
  join(input: { ticket: string; agentName: string; clientActionId: string }): Promise<unknown>;
  state(token: string): Promise<unknown>;
  wait(token: string, input: { afterRevision: number; timeoutMs: number; signal: AbortSignal }): Promise<unknown>;
  speak(token: string, input: { turnId: string; revision: number; clientActionId: string; payload: unknown }): Promise<unknown>;
  prepareVerdicts(token: string, input: { clientActionId: string; plaintiff: unknown; defendant: unknown; revision?: number }): Promise<unknown>;
}
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
const jsonHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

export async function handleCourtMcp(request: Request, deps: McpCourtDeps, allowedOrigins: Set<string>): Promise<Response> {
  let id: unknown = null;
  const error = (code: number, message: string, status = 200) => new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), { status, headers: jsonHeaders });
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins.has(origin)) return error(-32001, 'Origin is not allowed', 403);
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: 'This stateless MCP endpoint accepts POST only' } }), { status: 405, headers: { ...jsonHeaders, allow: 'POST' } });
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return error(-32600, 'Content-Type must be application/json', 415);
  const accept = request.headers.get('accept') || '';
  if (!accept.includes('application/json') || !accept.includes('text/event-stream')) return error(-32600, 'Accept must include application/json and text/event-stream', 406);
  const version = request.headers.get('mcp-protocol-version');
  if (version && version !== protocolVersion && version !== '2025-06-18' && version !== '2025-03-26') return error(-32600, 'Unsupported MCP protocol version', 400);
  let payload: unknown;
  try { payload = await request.json(); } catch { return error(-32700, 'Invalid JSON message', 400); }
  try {
    const rpc = object(payload);
    if ('id' in rpc) id = rpc.id;
    if (rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string' || ('id' in rpc && typeof id !== 'string' && typeof id !== 'number')) return error(-32600, 'Invalid JSON-RPC request', 400);
    if (!('id' in rpc)) return new Response(null, { status: 202, headers: jsonHeaders });
    let result: unknown;
    if (rpc.method === 'initialize') {
      const requested = rpc.params?.protocolVersion;
      result = { protocolVersion: ['2025-03-26', '2025-06-18', protocolVersion].includes(requested) ? requested : protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'internet-court', version: '1.0.0' }, instructions: `Read the guide at /agents/guide.md before joining. Each invitation grants exactly one role; humans alone vote. Join with the invitation ticket, then send the returned seatToken as Authorization: Bearer.` };
    } else if (rpc.method === 'ping') result = {};
    else if (rpc.method === 'tools/list') result = { tools: courtMcpTools };
    else if (rpc.method === 'tools/call') {
      const params = object(rpc.params); const args = object(params.arguments || {});
      const definition = courtMcpTools.find(item => item.name === params.name);
      if (!definition) return error(-32602, 'Unknown court tool');
      try {
        for (const key of Object.keys(args)) if (!(key in definition.inputSchema.properties)) throw new Error(`Unexpected argument: ${key}`);
        for (const key of definition.inputSchema.required) if (!(key in args)) throw new Error(`Missing argument: ${key}`);
        const auth = request.headers.get('authorization');
        const token = auth?.startsWith('Bearer ') ? auth.slice(7) : args.seatToken;
        if (params.name !== 'court_join') requiredString(token, 'seatToken / Authorization Bearer');
        let value: unknown;
        if (params.name === 'court_join') value = await deps.join({ ticket: requiredString(args.ticket, 'ticket'), agentName: requiredString(args.agentName, 'agentName'), clientActionId: requiredString(args.clientActionId, 'clientActionId') });
        else if (params.name === 'court_state') value = await deps.state(token);
        else if (params.name === 'court_wait') {
          const timeoutMs = args.timeoutMs === undefined ? 15000 : integer(args.timeoutMs, 'timeoutMs');
          if (timeoutMs > 15000) throw new Error('timeoutMs cannot exceed 15000');
          value = await deps.wait(token, { afterRevision: integer(args.afterRevision, 'afterRevision'), timeoutMs, signal: request.signal });
        } else if (params.name === 'court_speak') {
          if (args.emotion !== undefined && !emotion.enum.includes(args.emotion)) throw new Error('Invalid emotion');
          value = await deps.speak(token, { turnId: requiredString(args.turnId, 'turnId'), revision: integer(args.revision, 'revision'), clientActionId: requiredString(args.clientActionId, 'clientActionId'), payload: { text: requiredString(args.text, 'text'), ...(args.emotion ? { emotion: args.emotion } : {}), responseTo: ids(args.responseTo, 'responseTo'), evidenceIds: ids(args.evidenceIds, 'evidenceIds') } });
        } else {
          value = await deps.prepareVerdicts(token, { clientActionId: requiredString(args.clientActionId, 'clientActionId'), ...(args.revision === undefined ? {} : { revision: integer(args.revision, 'revision') }), plaintiff: { ...object(args.plaintiff), speaker: 'judge' }, defendant: { ...object(args.defendant), speaker: 'judge' } });
        }
        result = { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value, isError: false };
      } catch (cause) {
        const failure = cause instanceof Error ? cause.message : 'Court action failed';
        result = { content: [{ type: 'text', text: failure }], isError: true };
      }
    } else return error(-32601, 'Method not found');
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { status: 200, headers: jsonHeaders });
  } catch { return error(-32603, 'Court transport failed', 500); }
}
