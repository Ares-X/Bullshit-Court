import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn, execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function stdioAgent(base, ticket) {
  const child = spawn(process.execPath, ['public/agents/client.mjs', '--join-url', `${base}/join/${ticket}`], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let sequence = 0; let stderr = ''; let exited = false;
  child.stderr.on('data', chunk => { stderr += chunk; });
  const reader = createInterface({ input: child.stdout });
  reader.on('line', line => {
    const result = JSON.parse(line); const waiter = pending.get(result.id);
    if (waiter) { pending.delete(result.id); clearTimeout(waiter.timer); waiter.resolve(result); }
  });
  child.on('exit', () => { exited = true; for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error(`stdio exited: ${stderr}`)); } pending.clear(); });
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout calling ${method}: ${stderr}`)); }, 5000);
    pending.set(id, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n');
  });
  return {
    child, call, notify(method) { child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n'); },
    async tool(name, args = {}) { return (await call('tools/call', { name, arguments: args })).result; },
    async close() {
      if (exited) { reader.close(); return; }
      const closed = once(child, 'exit'); child.stdin.end();
      const timer = setTimeout(() => child.kill('SIGTERM'), 1000);
      try { await closed; } finally { clearTimeout(timer); reader.close(); }
    },
  };
}
const content = result => { assert.equal(result.isError, false, result.content?.[0]?.text); return result.structuredContent || JSON.parse(result.content[0].text); };

test('three independent stdio Agents use real HTTP MCP for ten turns, seal verdicts and leave publication to human HTTP votes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'court-mcp-'));
  let server, handler, service; const agents = [];
  try {
    const outfile = join(dir, 'backend.mjs');
    await build({ stdin: { contents: "export * from './server/courtService.ts'; export * from './server/courtHttp.ts'; export * from './src/data/presetCases.ts';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent' });
    const { CourtService, createCourtHttpHandler, PRESET_CASES } = await import(pathToFileURL(outfile));
    service = new CourtService({ storePath: ':memory:', autoTick: false });
    handler = createCourtHttpHandler({ service });
    server = createServer((req, res) => { void handler(req, res).then(handled => { if (!handled) { res.writeHead(404); res.end(); } }); });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const rpc = async (message, extra = {}) => {
      const response = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...extra }, body: JSON.stringify(message) });
      return { response, body: response.status === 202 ? null : await response.json() };
    };
    assert.equal((await fetch(`${base}/mcp`)).status, 405);
    assert.equal((await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' }, { origin: 'https://evil.example' })).response.status, 403);
    assert.equal((await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' }, { host: 'evil.example', origin: 'http://evil.example' })).response.status, 403);
    assert.equal((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).response.status, 202);
    assert.equal((await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'court_state', arguments: {} } })).body.result.isError, true);

    const createdResponse = await fetch(`${base}/api/games`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caseData: PRESET_CASES[0], mode: 'multiplayer', role: 'judge' }) });
    assert.equal(createdResponse.status, 201); const created = await createdResponse.json();
    const roles = ['judge', 'plaintiff', 'defendant']; const clients = {}; const tickets = {};
    for (const role of roles) {
      const invitation = role === 'judge' ? created.invitation : service.invite(created.game.id, { role }); tickets[role] = invitation.ticket;
      const landing = await (await fetch(`${base}${invitation.path}`)).text(); assert.match(landing, /agents\/guide\.md/); assert.match(landing, new RegExp(`roles/${role}\\.md`));
      const agent = stdioAgent(base, invitation.ticket); agents.push(agent); clients[role] = agent;
      const initialized = await agent.call('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: `protocol-sim-${role}`, version: '1' } });
      assert.equal(initialized.result.protocolVersion, '2025-11-25'); agent.notify('notifications/initialized');
      const tools = (await agent.call('tools/list')).result.tools;
      assert.deepEqual(tools.map(t => t.name), ['court_join', 'court_state', 'court_wait', 'court_speak', 'court_prepare_verdicts']);
      assert.ok(tools.every(t => !t.inputSchema.properties.seatToken)); assert.ok(tools.every(t => !/vote/.test(t.name)));
      const joined = content(await agent.tool('court_join', { agentName: `协议模拟-${role}`, clientActionId: `join-${role}` }));
      assert.equal(joined.role, role); assert.equal(joined.seatToken, undefined); assert.equal(joined.state.role, role);
      const duplicate = content(await agent.tool('court_join', { agentName: `协议模拟-${role}`, clientActionId: `join-${role}` })); assert.equal(duplicate.role, role);
    }
    // EOF cancels the bridge's pending HTTP request; reconnect with the same private
    // claim ID recovers this seat without taking a second seat or replaying a turn.
    const beforeReconnect = content(await clients.judge.tool('court_state'));
    const pendingWait = clients.judge.tool('court_wait', { afterRevision: beforeReconnect.expectedRevision, timeoutMs: 15000 }).catch(() => undefined);
    await new Promise(resolve => setTimeout(resolve, 20)); await clients.judge.close(); await pendingWait;
    const reconnected = stdioAgent(base, tickets.judge); agents.push(reconnected); clients.judge = reconnected;
    await reconnected.call('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'reconnected-judge', version: '1' } }); reconnected.notify('notifications/initialized');
    assert.equal(content(await reconnected.tool('court_join', { agentName: '协议模拟-judge', clientActionId: 'join-judge' })).role, 'judge');
    assert.equal((await clients.defendant.tool('court_prepare_verdicts', { clientActionId: 'wrong-role', plaintiff: {}, defendant: {} })).isError, true);
    let firstArgs;
    for (let round = 0; round < 10; round++) {
      const state = content(await clients.judge.tool('court_state')); const role = state.game.currentRole; assert.ok(role);
      const own = content(await clients[role].tool('court_state')); assert.equal(own.canSubmit, true);
      const args = { turnId: own.turnId, revision: own.expectedRevision, clientActionId: `round-${round}`, text: `协议模拟第${round + 1}轮：${role}当庭陈述。`, emotion: role === 'judge' ? 'gavel' : 'normal', responseTo: [], evidenceIds: own.game.session.evidences.map(e => e.id) };
      if (round === 0) {
        firstArgs = args;
        assert.equal((await clients.plaintiff.tool('court_speak', args)).isError, true);
        assert.equal((await clients.judge.tool('court_speak', { ...args, role: 'defendant' })).isError, true);
        assert.equal((await clients.judge.tool('court_speak', { ...args, revision: args.revision - 1 })).isError, true);
      }
      const accepted = content(await clients[role].tool('court_speak', args)); assert.equal(accepted.game.session.turns.length, round + 1);
      assert.ok(accepted.receipts.some(receipt => receipt.clientActionId === args.clientActionId && receipt.acceptedTurnId === args.turnId));
      const duplicate = content(await clients[role].tool('court_speak', args)); assert.equal(duplicate.game.session.turns.length, round + 1);
      assert.equal((await clients[role].tool('court_speak', { ...args, text: '同编号不同内容' })).isError, true);
    }
    const judge = content(await clients.judge.tool('court_state')); assert.equal(judge.action, 'prepare_verdicts'); assert.equal(judge.game.session.turns.length, 10);
    for (const role of ['plaintiff', 'defendant']) { const state = content(await clients[role].tool('court_state')); assert.equal(state.roleFinished, true); assert.equal(state.game.status, 'waiting-jury'); }
    const makeVerdict = winner => ({ text: winner === 'plaintiff' ? '原告获支持，奶茶应当交还宇宙。' : '被告获支持，薯条获得临时外交豁免。', responseTo: [], evidenceIds: judge.game.session.evidences.map(e => e.id), ruling: { winner, result: `${winner}获支持`, penalty: ['承担一项荒诞但无害的义务'], quote: '本庭承认事实和薯条的局限。', reasons: ['已审查双方三次陈述及现有证物；判词依据封存案卷，支持方由真人陪审票决定。'], evidenceIds: judge.game.session.evidences.map(e => e.id), consideredInterventionIds: [] } });
    const sealed = content(await clients.judge.tool('court_prepare_verdicts', { revision: judge.expectedRevision, clientActionId: 'sealed', plaintiff: makeVerdict('plaintiff'), defendant: makeVerdict('defendant') }));
    assert.equal(sealed.roleFinished, true); assert.equal(sealed.game.verdict.prepared, true); assert.equal(sealed.game.session.ruling, undefined);
    assert.ok(!JSON.stringify(sealed).includes('外交豁免')); assert.ok(!JSON.stringify(sealed).includes('奶茶应当'));
    assert.equal(content(await clients.judge.tool('court_speak', firstArgs)).game.session.turns.length, 10);
    const waiting = content(await clients.defendant.tool('court_wait', { afterRevision: sealed.expectedRevision, timeoutMs: 0 })); assert.equal(waiting.roleFinished, true);
    assert.equal((await clients.judge.tool('court_wait', { afterRevision: 0, timeoutMs: 15001 })).isError, true);

    // Disconnect all three agents before humans vote: the server must publish by itself.
    for (const agent of agents) await agent.close();
    for (let index = 0; index < 3; index++) {
      const visitor = await fetch(`${base}/api/visitor`); const cookie = visitor.headers.get('set-cookie').split(';')[0]; const { csrfToken } = await visitor.json();
      const response = await fetch(`${base}/api/games/${created.game.id}/votes`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie, 'x-court-csrf': csrfToken }, body: JSON.stringify({ winner: 'plaintiff', clientActionId: `human-vote-${index}` }) }); assert.equal(response.status, 200);
    }
    const final = await (await fetch(`${base}/api/games/${created.game.id}`)).json();
    assert.equal(final.status, 'completed'); assert.equal(final.session.ruling.winner, 'plaintiff'); assert.match(final.session.turns.at(-1).text, /奶茶/); assert.ok(!JSON.stringify(final).includes('外交豁免')); assert.ok(!JSON.stringify(final).includes('seatToken'));

    // A terminal-only Agent can make a single equivalent HTTP RPC without registering MCP.
    const cli = await promisify(execFile)(process.execPath, ['public/agents/client.mjs', '--join-url', `${base}/join/${tickets.judge}`, '--request', JSON.stringify({ jsonrpc: '2.0', id: 77, method: 'tools/list' })], { timeout: 5000 });
    assert.equal(JSON.parse(cli.stdout).result.tools.length, 5); assert.equal(cli.stderr, '');
  } finally {
    await Promise.allSettled(agents.map(agent => agent.close()));
    service?.close();
    handler?.close();
    if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await rm(dir, { recursive: true, force: true });
  }
});
