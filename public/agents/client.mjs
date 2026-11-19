#!/usr/bin/env node
// Zero-dependency MCP stdio <-> stateless Streamable HTTP bridge. Node >= 20.
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const options = {};
for (let index = 2; index < process.argv.length; index++) {
  const key = process.argv[index];
  if (key === '--help') {
    process.stderr.write('Usage: node client.mjs --join-url https://court.example/join/TICKET [--request JSON]\nOr: --url https://court.example/mcp [--ticket TICKET] [--seat-token TOKEN]\nDefault: newline MCP JSON-RPC on stdin/stdout. --request sends exactly one RPC and exits.\nJudge with Codex CLI: node client.mjs --run-codex --join-url https://court.example/join/TICKET\n');
    process.exit(0);
  }
  if (key === '--run-codex') {
    options['run-codex'] = true;
    continue;
  }
  if (!['--url', '--ticket', '--join-url', '--request', '--seat-token', '--runner-file'].includes(key) || !process.argv[index + 1]) {
    process.stderr.write(`Invalid option: ${key}. See --help.\n`); process.exit(2);
  }
  options[key.slice(2)] = process.argv[++index];
}

const runnerFile = options['runner-file'];
const runnerName = 'Codex';
const runnerInstructions = '本地接力已连接。先调用 court_read_rules 阅读入场页及法官规则，未入场时调用 court_join，续审时先调用 court_state。第十轮封卷得到回执后，若场次为 waiting-jury，请结束当前 Codex 回合。接力程序等到陪审结果产生，再恢复同一个 Codex 会话。如果状态已是 waiting-verdict，直接完成第十一轮。';
let target, invite, claim;

function validatePrivate(stat) {
  if ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) {
    throw new Error('接力目录和文件仅应允许当前用户访问');
  }
}

async function readPrivate(path) {
  const stat = await lstat(path);
  validatePrivate(stat);
  if (!stat.isFile()) throw new Error('接力状态须保存在本地普通文件中');
  return readFile(path, 'utf8');
}

async function readIfExists(path) {
  try { return await readPrivate(path); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function readClaim(path) {
  const raw = await readIfExists(path);
  if (raw === undefined) return;
  try {
    const saved = JSON.parse(raw);
    if (typeof saved.joinUrl === 'string' && typeof saved.clientActionId === 'string'
      && (saved.seatToken === undefined || typeof saved.seatToken === 'string')) return saved;
  } catch { /* Do not include stored credentials in a parse error. */ }
  throw new Error('本地席位记录损坏');
}

async function writePrivate(path, value) {
  const pending = `${path}.${randomUUID()}.tmp`;
  await writeFile(pending, value, { mode: 0o600, flag: 'wx' });
  try { await rename(pending, path); }
  catch (error) { await unlink(pending).catch(() => {}); throw error; }
}

function parseInvite(url) {
  const parsed = new URL(url);
  if (!/^\/join\/[a-zA-Z0-9._~-]+$/.test(parsed.pathname) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('请使用法庭签发的完整邀请链接');
  }
  return parsed;
}

try {
  if (runnerFile) {
    if (Object.keys(options).length !== 1) throw new Error('接力桥接参数无效');
    claim = await readClaim(runnerFile);
    if (!claim) throw new Error('未找到本地席位记录');
    invite = parseInvite(claim.joinUrl);
  } else if (options['run-codex']) {
    if (Object.keys(options).length !== 2 || !options['join-url']) throw new Error('本地接力只接受法官邀请链接');
    invite = parseInvite(options['join-url']);
  } else if (options['join-url']) invite = new URL(options['join-url']);
  if (invite) options.ticket ||= invite.searchParams.get('ticket') || decodeURIComponent(invite.pathname.split('/').filter(Boolean).pop() || '');
  target = new URL(options['run-codex'] || runnerFile ? new URL('/mcp', invite) : options.url || process.env.COURT_MCP_URL || (invite ? new URL('/mcp', invite).href : ''));
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Expected http(s) URL');
  if (target.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) throw new Error('Remote MCP connections require HTTPS');
  if (target.username || target.password) throw new Error('Put the seat token in --seat-token or COURT_SEAT_TOKEN, not in the URL');
} catch (cause) { process.stderr.write(`Court connection: ${cause.message}. See --help.\n`); process.exit(2); }

let token = runnerFile ? (claim.seatToken || '') : options['seat-token'] || process.env.COURT_SEAT_TOKEN || '';
const controllers = new Set();
let stopping = false;
function output(value) { if (!stopping) process.stdout.write(JSON.stringify(value) + '\n'); }
function rpcError(id, message) { return { jsonrpc: '2.0', id: id ?? null, error: { code: -32000, message } }; }

async function officialPage(path, { asJson = false, optional = false } = {}) {
  const response = await fetch(new URL(path, invite), { redirect: 'error', signal: AbortSignal.timeout(10000) });
  const html = response.headers.get('content-type')?.startsWith('text/html');
  if (optional && (response.status === 404 || html)) return;
  if (!response.ok || html) {
    throw new Error(`读取法庭页面失败（HTTP ${response.status}）`);
  }
  if (!asJson) return response.text();
  try { return await response.json(); }
  catch { throw new Error('法庭返回的入场资料无法解析'); }
}

function inspectInvite() {
  return officialPage(`/api/invitations/${encodeURIComponent(options.ticket)}`, { asJson: true });
}

async function readJudgeRules() {
  const info = await inspectInvite();
  const castId = /^cast:([a-z][a-z0-9-]{0,30}):judge$/.exec(info.game?.session?.caseData?.agents?.judge?.id)?.[1];
  const [landing, guide, role, persona] = await Promise.all([
    officialPage(invite.pathname), officialPage('/agents/guide.md'), officialPage('/agents/roles/judge.md'),
    castId && officialPage(`/agents/judges/${castId}.md`, { optional: true }),
  ]);
  return { runner: runnerInstructions, landing, guide, role, ...(persona ? { persona } : {}) };
}

async function forward(message, signal) {
  const request = structuredClone(message);
  if (runnerFile && request.method === 'tools/call' && request.params?.name === 'court_read_rules') {
    const rules = await readJudgeRules();
    return { jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify(rules) }], structuredContent: rules } };
  }
  if (request.method === 'tools/call' && request.params?.name === 'court_join') {
    if (runnerFile) request.params.arguments = { ticket: options.ticket, agentName: runnerName, clientActionId: claim.clientActionId };
    else {
      request.params.arguments ||= {};
      if (!request.params.arguments.ticket && options.ticket) request.params.arguments.ticket = options.ticket;
    }
  } else if (runnerFile && request.method === 'tools/call' && request.params?.arguments) {
    delete request.params.arguments.seatToken;
  }
  const controller = new AbortController(); controllers.add(controller);
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
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
        if (runnerFile) {
          claim.seatToken = token;
          await writePrivate(runnerFile, JSON.stringify(claim));
        }
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
        if (tool.name === 'court_join' && runnerFile) tool.inputSchema = { type: 'object', properties: {}, additionalProperties: false };
        else if (options.ticket && tool.name === 'court_join') tool.inputSchema.required = tool.inputSchema.required.filter(key => key !== 'ticket');
      }
      if (runnerFile) result.result.tools.unshift({
        name: 'court_read_rules', description: '先读取本场官方入场页、总规程、法官规程和选中法官的人物提示词，再入场。返回本地接力方式。',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, openWorldHint: false },
      });
    }
    if (runnerFile && request.method === 'initialize' && result.result) {
      result.result.instructions = runnerInstructions;
    }
    return result;
  } finally { clearTimeout(timer); controllers.delete(controller); signal?.removeEventListener('abort', abort); }
}

async function courtState(signal, afterRevision) {
  const wait = afterRevision !== undefined;
  const result = await forward({
    jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
      name: wait ? 'court_wait' : 'court_state',
      arguments: wait ? { afterRevision, timeoutMs: 15000 } : {},
    },
  }, signal);
  const state = result?.result?.structuredContent;
  if (result?.error || result?.result?.isError || state?.role !== 'judge') throw new Error('无法读取已领取的法官席位');
  return state;
}

async function privateDirectory(path) {
  try { await mkdir(path, { mode: 0o700 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const stat = await lstat(path);
  validatePrivate(stat);
  if (!stat.isDirectory()) throw new Error('接力目录须为本地普通目录');
}

const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const initialPrompt = () => `来互联网法庭出庭，按网站规则完成你的角色：${invite.href}`;
const verdictPrompt = '陪审团已完成投票。继续你在互联网法庭已领取的同一法官席位。按原法官人设出庭，先读取最新 court_state 和票数，按票决新写并提交第十一轮判词；确认服务器回执后结束。';
const recoverPrompt = '继续你在互联网法庭已领取或正在领取的同一法官席位。先读取官方规程和当前状态，再从服务器记录的进度继续。';

async function runCodex() {
  const info = await inspectInvite();
  if (info.role !== 'judge' || info.game?.verdict?.flow !== 'post-jury') {
    throw new Error('本地接力用于封卷后由原法官宣判的场次');
  }
  const base = resolve(process.env.COURT_RUNNER_STATE_DIR || join(homedir(), '.internet-court'));
  const dir = join(base, createHash('sha256').update(invite.href).digest('hex'));
  const workDir = join(dir, 'work');
  await privateDirectory(base);
  await privateDirectory(dir);
  const claimPath = join(dir, 'claim.json');
  const sessionPath = join(dir, 'session.id');
  const lockPath = join(dir, 'running.pid');
  try { await writeFile(lockPath, String(process.pid), { mode: 0o600, flag: 'wx' }); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('法官接力已运行。若上次异常终止，请确认 running.pid 的进程已退出后移除该文件');
    throw error;
  }
  let child, finished;
  const abort = new AbortController();
  const stop = () => { abort.abort(); child?.kill(); };
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const signal of signals) process.once(signal, stop);
  try {
    let session = await readIfExists(sessionPath);
    if (session && !sessionPattern.test(session)) throw new Error('Codex 会话编号无效');
    if (!session && info.claimed) throw new Error('该席位已有法官。请回到原法官的会话或使用原接力记录');
    claim = await readClaim(claimPath);
    if (!claim) {
      claim = { joinUrl: invite.href, clientActionId: randomUUID() };
      await writePrivate(claimPath, JSON.stringify(claim));
    } else if (claim.joinUrl !== invite.href) throw new Error('接力记录与当前邀请不一致');
    await privateDirectory(workDir);
    token = claim.seatToken || '';
    if (session && info.claimed && !token) {
      const recovered = await forward({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
        name: 'court_join', arguments: { ticket: options.ticket, agentName: runnerName, clientActionId: claim.clientActionId },
      } }, abort.signal);
      if (recovered?.error || recovered?.result?.isError || !token) throw new Error('法庭无法恢复原领取记录');
      claim.seatToken = token;
      await writePrivate(claimPath, JSON.stringify(claim));
    }
    const config = [
      '--json', '--ignore-user-config', '--skip-git-repo-check', '--disable', 'shell_tool',
      '-c', 'approval_policy="never"', '-c', 'sandbox_mode="read-only"', '-c', 'web_search="disabled"',
      '-c', `mcp_servers.internet_court.command=${JSON.stringify(process.execPath)}`,
      '-c', `mcp_servers.internet_court.args=${JSON.stringify([fileURLToPath(import.meta.url), '--runner-file', claimPath])}`,
    ];
    async function takeTurn(prompt) {
      abort.signal.throwIfAborted();
      const command = session ? ['exec', 'resume', ...config, session, '-'] : ['exec', ...config, '-'];
      child = spawn('codex', command, { cwd: workDir, stdio: ['pipe', 'pipe', 'ignore'] });
      const done = new Promise((resolve, reject) => {
        child.once('close', resolve);
        child.once('error', reject);
      });
      child.stdin.on('error', () => {}); // A startup failure can close stdin before Codex reads the prompt.
      child.stdin.end(prompt);
      const events = createInterface({ input: child.stdout, crlfDelay: Infinity });
      const capture = async () => {
        for await (const line of events) {
          let event;
          try { event = JSON.parse(line); } catch { continue; }
          if (event.type !== 'thread.started' || !sessionPattern.test(event.thread_id)) continue;
          if (session && session !== event.thread_id) throw new Error('Codex 返回了不同的会话编号');
          if (!session) {
            session = event.thread_id;
            await writePrivate(sessionPath, session);
          }
        }
      };
      let code;
      try { [code] = await Promise.all([done, capture()]); } finally { child?.kill(); child = undefined; }
      abort.signal.throwIfAborted();
      if (!session) throw new Error('Codex 未返回会话编号，请检查 CLI 版本和登录状态');
      token = (await readClaim(claimPath))?.seatToken || '';
      return code;
    }

    let state = token ? await courtState(abort.signal) : undefined;
    if (!state || (!state.roleFinished && !['waiting-jury', 'waiting-verdict'].includes(state.game.status))) {
      const code = await takeTurn(session ? recoverPrompt : initialPrompt());
      state = token ? await courtState(abort.signal) : undefined;
      if (!state || (!state.roleFinished && !['waiting-jury', 'waiting-verdict'].includes(state.game.status))) {
        throw new Error(`Codex 在封卷前退出（状态 ${code ?? '中断'}）。重新运行接力可继续本次庭审`);
      }
    }
    if (state.game.status === 'waiting-jury') process.stdout.write('已封卷。接力将在陪审结果公布后恢复原法官会话。\n');
    while (state.game.status === 'waiting-jury' && !state.roleFinished) {
      const revision = state.expectedRevision;
      state = await courtState(abort.signal, revision);
      if (state.game.status === 'waiting-jury') await delay(30000, undefined, { signal: abort.signal });
    }
    if (state.action === 'submit_verdict' && state.canSubmit && state.game.status === 'waiting-verdict') {
      process.stdout.write('陪审已结束，正在恢复原法官会话。\n');
      await takeTurn(verdictPrompt);
      state = await courtState(abort.signal);
    }
    if (!state.roleFinished) throw new Error('法官席位仍有待处理轮次。重新运行接力可恢复原会话');
    finished = true;
    process.stdout.write(state.game.status === 'completed' ? '原法官已宣判。\n' : '本场庭审已结束。\n');
  } finally {
    for (const signal of signals) process.removeListener(signal, stop);
    try {
      if (finished) {
        await unlink(claimPath);
        if (await readIfExists(sessionPath)) await unlink(sessionPath);
        await rmdir(workDir);
      }
    } finally { await unlink(lockPath); }
    if (finished) await rmdir(dir);
  }
}

if (options['run-codex']) {
  try { await runCodex(); }
  catch (cause) {
    process.stderr.write(cause.name === 'AbortError' ? '接力已停止，原会话可恢复。\n' : `Court runner: ${cause.message}\n`);
    process.exitCode = cause.name === 'AbortError' ? 130 : 1;
  }
} else if (options.request) {
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
