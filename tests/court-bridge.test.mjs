import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createCourtBridgeHandler } from '../server/courtBridge.mjs';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
async function withServer(run, options) {
  const bridge = createCourtBridgeHandler(options);
  const server = createServer((req, res) => { void bridge(req, res, () => { res.writeHead(404); res.end(); }); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run(base); } finally { bridge.close(); await new Promise(resolve => server.close(resolve)); }
}
const sample = { version: 1, id: 'court-real-browser', caseData: { title: '实际页面' }, turns: [], evidences: [] };
async function json(base, path, method = 'GET', body, token, extraHeaders = {}) {
  const response = await fetch(`${base}/api/court${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { 'x-court-token': token } : {}), ...extraHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}
test('HTTP bridge authenticates real snapshots, queues commands with applied/rejected receipts and expires disconnected browsers', async () => {
  let time = 10_000;
  await withServer(async base => {
    assert.equal((await json(base, '/sessions', 'POST', { snapshot: sample }, null, { origin: 'https://untrusted.example' })).status, 403);
    const registered = await json(base, '/sessions', 'POST', { snapshot: { ...sample, apiKey: 'SECRET', nested: { authorization: 'LEAK' } } });
    assert.equal(registered.status, 201); const { sessionId, token } = registered.data; const path = `/sessions/${sessionId}`;
    assert.equal((await json(base, `${path}/state`)).status, 401);
    const state = await json(base, `${path}/state`, 'GET', undefined, token); assert.equal(state.data.connected, true); assert.ok(!JSON.stringify(state.data).includes('SECRET')); assert.ok(!JSON.stringify(state.data).includes('LEAK'));
    assert.equal((await json(base, `${path}/commands`, 'POST', { type: 'argument', role: 'lawyer', text: 'x' }, token)).status, 400);
    const queued = await json(base, `${path}/commands`, 'POST', { type: 'argument', role: 'plaintiff', text: '新的当事人陈述', responseTo: ['real-input'], evidenceIds: ['ev-1'] }, token);
    assert.equal(queued.status, 202); assert.equal(queued.data.status, 'queued');
    const pending = await json(base, `${path}/commands`, 'GET', undefined, token); assert.equal(pending.data.commands[0].text, '新的当事人陈述'); assert.deepEqual(pending.data.commands[0].responseTo, ['real-input']);
    await json(base, `${path}/commands/${queued.data.commandId}`, 'PUT', { status: 'rejected', error: '不是当前角色' }, token);
    const receipt = await json(base, `${path}/state`, 'GET', undefined, token); assert.equal(receipt.data.commands[0].status, 'rejected'); assert.equal(receipt.data.commands[0].error, '不是当前角色');
    const python = await promisify(execFile)('python3', ['-c', `
import sys, types, runpy, json
class MCP:
    def __init__(self, *args): pass
    def tool(self): return lambda fn: fn
for name in ('mcp', 'mcp.server', 'mcp.server.fastmcp'): sys.modules[name] = types.ModuleType(name)
sys.modules['mcp.server.fastmcp'].FastMCP = MCP
tools = runpy.run_path('mcp-server/court_mcp.py')
print(json.dumps({'state': json.loads(tools['get_court_case_state']()), 'queued': json.loads(tools['submit_court_argument']('defendant', '被告本人', '这是经Python桥接传来的陈述', response_to=['input-real'], evidence_ids=['ev-real']))}))
`], { cwd: process.cwd(), env: { ...process.env, COURT_BRIDGE_URL: `${base}/api/court`, COURT_SESSION_ID: sessionId, COURT_SESSION_TOKEN: token }, timeout: 5000 });
    const pythonResults = JSON.parse(python.stdout); assert.equal(pythonResults.state.snapshot.id, sample.id); assert.equal(pythonResults.queued.status, 'queued');
    const pythonCommand = (await json(base, `${path}/commands`, 'GET', undefined, token)).data.commands.find(command => command.id === pythonResults.queued.commandId);
    assert.equal(pythonCommand.text, '这是经Python桥接传来的陈述'); assert.deepEqual(pythonCommand.responseTo, ['input-real']);
    const ruling = { type: 'ruling', role: 'judge', ruling: { winner: 'plaintiff', result: '原告胜', quote: '已宣判', penalty: [], reasons: ['证据'], evidenceIds: [], consideredInterventionIds: [] } };
    assert.equal((await json(base, `${path}/commands`, 'POST', ruling, token)).status, 409);
    await json(base, `${path}/state`, 'PUT', { snapshot: { ...sample, juryVote: 'plaintiff' } }, token);
    assert.equal((await json(base, `${path}/commands`, 'POST', ruling, token)).status, 202);
    time += 15_001; assert.equal((await json(base, `${path}/state`, 'GET', undefined, token)).data.connected, false);
    assert.equal((await json(base, `${path}/commands`, 'POST', { type: 'argument', role: 'judge', text: 'late' }, token)).status, 409);
    assert.equal((await json(base, `${path}/state`, 'PUT', { snapshot: { ...sample, over: 'a'.repeat(250_001) } }, token)).status, 413);
    await json(base, path, 'DELETE', undefined, token); assert.equal((await json(base, `${path}/state`, 'GET', undefined, token)).status, 404);
  }, { now: () => time });
});
test('browser helper publishes actual runtime state, applies a queued command once and releases its session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'court-bridge-test-'));
  const priorWindow = globalThis.window;
  try {
    await build({ stdin: { contents: "export * from './src/utils/courtBridge.ts'; export * from './src/utils/courtRuntime.ts'; export * from './src/data/presetCases.ts';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'browser.mjs'), logLevel: 'silent' });
    const { connectCourtBridge, createCourtSession, PRESET_CASES } = await import(pathToFileURL(join(dir, 'browser.mjs')));
    await withServer(async base => {
      globalThis.window = { location: { origin: base } };
      const commands = []; let handle;
      try {
        const session = createCourtSession(PRESET_CASES[0]);
        handle = await connectCourtBridge(session, command => { commands.push(command); });
        const path = `/sessions/${handle.connection.sessionId}`; const token = handle.connection.token;
        const state = await json(base, `${path}/state`, 'GET', undefined, token); assert.equal(state.data.snapshot.id, session.id); assert.equal(state.data.agentRequest.role, 'judge'); assert.ok(state.data.agentRequest.messages.length >= 2);
        const queued = await json(base, `${path}/commands`, 'POST', { type: 'argument', role: 'judge', text: '本庭开始审理' }, token); assert.equal(queued.status, 202);
        const deadline = Date.now() + 4000;
        let receipt;
        do { await new Promise(resolve => setTimeout(resolve, 40)); receipt = await json(base, `${path}/state`, 'GET', undefined, token); } while (receipt.data.commands[0].status === 'queued' && Date.now() < deadline);
        assert.equal(receipt.data.commands[0].status, 'applied'); assert.equal(commands.length, 1);
        await handle.publish({ ...session, id: 'court-updated' }); assert.equal((await json(base, `${path}/state`, 'GET', undefined, token)).data.snapshot.id, 'court-updated');
        await handle.disconnect(); assert.equal((await json(base, `${path}/state`, 'GET', undefined, token)).status, 404);
      } finally { await handle?.disconnect(); }
    });
  } finally { globalThis.window = priorWindow; await rm(dir, { recursive: true, force: true }); }
});
