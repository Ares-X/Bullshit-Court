import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('a stopped judge runner resumes its own session and seat when the jury finishes', { timeout: 10000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'court-judge-runner-'));
  const session = '87f12600-aae5-48b8-9e06-8b64af015183';
  const seatToken = 'private-test-seat';
  const client = fileURLToPath(new URL('../public/agents/client.mjs', import.meta.url));
  const polled = Promise.withResolvers();
  let status = 'running', claims = 0, originalClaim, running;
  const game = () => ({ status, verdict: { flow: 'post-jury' } });
  const state = () => ({ game: game(), role: 'judge', roleFinished: status === 'completed', action: status === 'waiting-verdict' ? 'submit_verdict' : 'wait', canSubmit: status === 'waiting-verdict', expectedRevision: 10 });
  const server = createServer(async (req, res) => {
    let response = { game: game(), role: 'judge', claimed: claims > 0 };
    if (req.method === 'POST') {
      const request = JSON.parse(await Array.fromAsync(req).then(chunks => Buffer.concat(chunks).toString()));
      const { name, arguments: args } = request.params;
      let value;
      if (name === 'court_join') {
        if (args.ticket !== 'game.invite' || !args.clientActionId) return res.writeHead(400).end();
        originalClaim ??= args.clientActionId;
        if (args.clientActionId !== originalClaim) return res.writeHead(409).end();
        claims++;
        value = { seatToken, state: state() };
      } else {
        if (req.headers.authorization !== `Bearer ${seatToken}`) return res.writeHead(403).end();
        if (name === 'court_wait') polled.resolve();
        if (name === 'court_speak') status = status === 'running' ? 'waiting-jury' : 'completed';
        value = state();
      }
      response = { jsonrpc: '2.0', id: request.id, result: { content: [], structuredContent: value } };
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(response));
  });
  server.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const invite = `http://127.0.0.1:${server.address().port}/join/game.invite`;
    await writeFile(join(dir, 'codex'), `#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';
const args = process.argv.slice(2);
const resume = args[1] === 'resume';
const prompt = (await Array.fromAsync(process.stdin)).join('');
const session = ${JSON.stringify(session)};
if (resume) assert.equal(args.at(-2), session);
else assert.equal(prompt, ${JSON.stringify(`来互联网法庭出庭，按网站规则完成你的角色：${invite}`)});
console.log(JSON.stringify({ type: 'thread.started', thread_id: session }));
const mcp = spawn(process.execPath, JSON.parse(args.find(arg => arg.startsWith('mcp_servers.internet_court.args=')).split('args=')[1]));
const replies = createInterface({ input: mcp.stdout })[Symbol.asyncIterator]();
async function call(name) {
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name } }) + '\\n');
  const reply = (await replies.next()).value;
  assert.ok(!reply.includes(${JSON.stringify(seatToken)}));
  assert.ok(JSON.parse(reply).result);
}
if (!resume) await call('court_join');
await call('court_speak');
mcp.stdin.end();
`, { mode: 0o700 });
    const start = () => {
      running = spawn(process.execPath, [client, '--run-codex', '--join-url', invite], {
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, COURT_RUNNER_STATE_DIR: join(dir, 'state') },
      });
      running.stdout.resume();
      running.stderr.resume();
      return once(running, 'close');
    };
    const stopped = start();
    const timedOut = once(t.signal, 'abort').then(() => assert.fail('runner test timed out'));
    await Promise.race([polled.promise, timedOut, stopped.then(() => assert.fail('runner stopped before waiting for the jury'))]);
    const [record] = await readdir(join(dir, 'state'));
    const claimFile = join(dir, 'state', record, 'claim.json');
    assert.equal(await readFile(join(dir, 'state', record, 'session.id'), 'utf8'), session);
    assert.equal((await stat(claimFile)).mode & 0o777, 0o600);
    running.kill('SIGHUP');
    assert.deepEqual(await stopped, [130, null]);
    const saved = JSON.parse(await readFile(claimFile, 'utf8'));
    assert.equal(saved.seatToken, seatToken);
    delete saved.seatToken; // Simulate losing the response after the server claimed the invitation.
    await writeFile(claimFile, JSON.stringify(saved));
    status = 'waiting-verdict';
    assert.deepEqual(await Promise.race([start(), timedOut]), [0, null]);
    assert.equal(status, 'completed');
    assert.equal(claims, 2);
    assert.deepEqual(await readdir(join(dir, 'state')), []);
  } finally {
    if (running && running.exitCode === null && running.signalCode === null) {
      running.kill('SIGTERM');
      await once(running, 'close');
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
