#!/usr/bin/env node
// Zero-dependency MCP stdio <-> stateless Streamable HTTP bridge. Node >= 20.
import { createInterface } from 'node:readline';

const options = {};
for (let index = 2; index < process.argv.length; index++) {
  const key = process.argv[index];
  if (key === '--help') {
    process.stderr.write('Usage: node client.mjs --join-url https://court.example/join/TICKET [--request JSON]\nOr: --url https://court.example/mcp [--ticket TICKET] [--seat-token TOKEN]\nDefault: newline MCP JSON-RPC on stdin/stdout. --request sends exactly one RPC and exits.\n');
    process.exit(0);
  }
  if (!['--url', '--ticket', '--join-url', '--request', '--seat-token'].includes(key) || !process.argv[index + 1]) {
    process.stderr.write(`Invalid option: ${key}. See --help.\n`); process.exit(2);
  }
  options[key.slice(2)] = process.argv[++index];
}
let target;
try {
  const invite = options['join-url'] ? new URL(options['join-url']) : undefined;
  if (invite) options.ticket ||= invite.searchParams.get('ticket') || decodeURIComponent(invite.pathname.split('/').filter(Boolean).pop() || '');
  target = new URL(options.url || process.env.COURT_MCP_URL || (invite ? new URL('/mcp', invite).href : ''));
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Expected http(s) URL');
  if (target.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) throw new Error('Remote MCP connections require HTTPS');
  if (target.username || target.password) throw new Error('Put the seat token in --seat-token or COURT_SEAT_TOKEN, not in the URL');
} catch (cause) { process.stderr.write(`Court connection: ${cause.message}. See --help.\n`); process.exit(2); }

let token = options['seat-token'] || process.env.COURT_SEAT_TOKEN || '';
const controllers = new Set();
let stopping = false;
function output(value) { if (!stopping) process.stdout.write(JSON.stringify(value) + '\n'); }
function rpcError(id, message) { return { jsonrpc: '2.0', id: id ?? null, error: { code: -32000, message } }; }

async function forward(message) {
  const request = structuredClone(message);
  if (request.method === 'tools/call' && request.params?.name === 'court_join') {
    request.params.arguments ||= {};
    if (!request.params.arguments.ticket && options.ticket) request.params.arguments.ticket = options.ticket;
  }
  const controller = new AbortController(); controllers.add(controller);
  const timer = setTimeout(() => controller.abort(new Error('HTTP request timed out; inspect court_state before retrying a mutation')), 22000);
  try {
    const response = await fetch(target, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(request), signal: controller.signal, redirect: 'error',
    });
    if (response.status === 202 && !('id' in request)) return;
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch { throw new Error(`Court returned HTTP ${response.status} without a JSON-RPC response`); }
    if (!result || result.jsonrpc !== '2.0') throw new Error(`Court returned invalid JSON-RPC (HTTP ${response.status})`);
    if (request.method === 'tools/call' && request.params?.name === 'court_join' && !result.result?.isError) {
      const joined = result.result?.structuredContent || JSON.parse(result.result?.content?.[0]?.text || '{}');
      if (typeof joined.seatToken === 'string') {
        token = joined.seatToken;
        // Stdio keeps authentication outside model context. One-shot CLI must return
        // the credential because its process exits; its caller must keep it private.
        if (!options.request) {
          delete joined.seatToken;
          result.result.structuredContent = joined;
          result.result.content = [{ type: 'text', text: JSON.stringify(joined) }];
        }
      }
    }
    if (request.method === 'tools/list' && result.result?.tools) {
      for (const tool of result.result.tools) {
        delete tool.inputSchema?.properties?.seatToken;
        if (options.ticket && tool.name === 'court_join') tool.inputSchema.required = tool.inputSchema.required.filter(key => key !== 'ticket');
      }
    }
    return result;
  } finally { clearTimeout(timer); controllers.delete(controller); }
}

if (options.request) {
  try { const result = await forward(JSON.parse(options.request)); if (result) output(result); }
  catch (cause) { output(rpcError(null, cause.message)); process.exitCode = 1; }
} else {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  function stop() { if (stopping) return; stopping = true; input.close(); for (const controller of controllers) controller.abort(); }
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  input.on('line', line => {
    if (!line.trim() || stopping) return;
    if (line.length > 128000) { output(rpcError(null, 'Message too large')); return; }
    let message;
    try { message = JSON.parse(line); } catch { output({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }); return; }
    if (!message || typeof message !== 'object' || Array.isArray(message)) { output(rpcError(null, 'Expected one JSON-RPC object')); return; }
    void forward(message).then(result => { if (result) output(result); }).catch(cause => { if ('id' in message) output(rpcError(message.id, cause.message)); });
  });
  input.once('close', () => { stopping = true; for (const controller of controllers) controller.abort(); });
}
