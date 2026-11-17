import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Use the installed compiler only; no dependency, service or generated project artifact is retained.
const temporary = await mkdtemp(join(tmpdir(), 'internet-court-runtime-'));
let runtime, presets;
try {
  const dataSource = await readFile(new URL('../src/data/presetCases.ts', import.meta.url), 'utf8');
  const dataEntry = join(temporary, 'presetCases.mjs');
  await writeFile(dataEntry, ts.transpileModule(dataSource, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText);
  presets = (await import(pathToFileURL(dataEntry).href)).PRESET_CASES;
  const source = await readFile(new URL('../src/utils/courtRuntime.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } });
  const entry = join(temporary, 'court-runtime.mjs');
  await writeFile(entry, output.outputText.replace("'../data/presetCases'", "'./presetCases.mjs'"));
  runtime = await import(pathToFileURL(entry).href);
} finally { await rm(temporary, { recursive: true, force: true }); }
const { createCourtSession, advanceCourtSession, castJuryVote, requestCourtRuling,
  submitCourtIntervention, getCourtBalance, createAppealSession, getCourtRoleProfile,
  applyExternalCourtTurn, applyExternalCourtRuling, validateCourtSession, getNextCourtRole } = runtime;

const caseData = {
  id: 'case-test', title: '奶茶失踪案', caseNumber: '测试001', category: '友谊塑料', tags: ['测试'],
  summary: '小林称小陈取走了冰箱里的奶茶，小陈对此提出异议。',
  plaintiffName: '小林', plaintiffTitle: '奶茶所有者', defendantName: '小陈', defendantTitle: '室友', coreClash: '谁拿走了奶茶，是否得到同意',
  evidences: [{ id: 'original-1', name: '冰箱照片', description: '照片中显示一个奶茶杯，拍摄时间待核实。', icon: '📷', owner: 'plaintiff' }],
  turns: [{ id: 'future-secret', text: '不能出现的预写终局剧本' }],
  plaintiffVerdict: { result: '不能直接读取的预置结局', penalty: [], quote: '预置' },
  defendantVerdict: { result: '不能直接读取的预置结局', penalty: [], quote: '预置' },
  agents: {
    judge: { id: 'cast:a:judge', name: '沈衡', model: '角色配置', avatar: '/casts/judge.png', persona: '沉着且一针见血' },
    plaintiff: { id: 'cast:a:plaintiff', name: '错误姓名不可使用', model: '角色配置', avatar: '/casts/plaintiff.png', persona: '据理力争' },
    defendant: { id: 'cast:a:defendant', name: '错误姓名不可使用', model: '角色配置', avatar: '/casts/defendant.png', persona: '冷静解释' },
  },
};
const jsonSnapshot = value => JSON.stringify(value);
async function finishArguments(session) {
  while (session.status === 'active' && session.pendingTurns.length) session = await advanceCourtSession(session);
  return session;
}
const publicTurn = (speaker, extras = {}) => ({ speaker, text: '这是本轮公开发言。', responseTo: [], evidenceIds: [], emotion: 'normal', ...extras });
async function withApi(handler, callback) {
  const sockets = new Set();
  const server = createServer(handler);
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = { apiKey: 'test-secret-never-persist', apiEndpoint: `http://127.0.0.1:${server.address().port}/v1`, modelName: 'test-compatible', timeoutMs: 1000 };
  try { await callback(config); }
  finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    assert.equal(server.listening, false);
  }
}
const answer = (res, payload) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] })); };

test('three roles proceed one event at a time; parties appear in person and cast judge is stable', async () => {
  let session = createCourtSession(caseData);
  assert.deepEqual(session.turns, []);
  assert.deepEqual(session.caseData.turns, []);
  const original = jsonSnapshot(session);
  const first = await advanceCourtSession(session);
  assert.equal(session.turns.length, 0);
  assert.equal(jsonSnapshot(session), original);
  assert.equal(first.turns.length, 1);
  assert.equal(first.turns[0].speakerName, '沈衡');
  session = await finishArguments(first);
  assert.deepEqual(session.turns.map(t => t.speaker), ['judge', 'plaintiff', 'defendant', 'judge', 'plaintiff', 'defendant', 'judge', 'plaintiff', 'defendant', 'judge']);
  assert.equal(session.status, 'awaiting-ruling');
  assert.equal(getNextCourtRole(session), null);
  assert.equal(new Set(session.turns.map(t => t.id)).size, session.turns.length);
  assert.ok(session.turns.filter(t => t.speaker === 'plaintiff').every(t => t.speakerName === '小林' && t.text.includes('我')));
  assert.ok(session.turns.filter(t => t.speaker === 'defendant').every(t => t.speakerName === '小陈' && t.text.includes('我')));
  assert.ok(session.turns.every(t => t.agentThought === undefined));
  assert.match(getCourtRoleProfile(caseData, 'plaintiff').persona, /本人/);
  assert.match(getCourtRoleProfile(caseData, 'judge').persona, /沉着/);
});

test('empty case has no invented evidence or predetermined winner', async () => {
  let session = await finishArguments(createCourtSession({ ...caseData, evidences: [], turns: [] }));
  assert.equal(session.evidences.length, 0);
  assert.ok(session.turns.every(t => t.evidenceIds.length === 0));
  assert.throws(() => requestCourtRuling(session), { code: 'INVALID_STATE' });
  assert.throws(() => castJuryVote(createCourtSession(caseData), 'plaintiff'), { code: 'INVALID_STATE' });
  session = await advanceCourtSession(castJuryVote(session, 'defendant'));
  assert.equal(session.ruling.winner, 'defendant');
  assert.equal(session.mode, 'rehearsal');
  assert.match(session.ruling.result, /依陪审团票决/);
  assert.match(session.ruling.reasons.join(''), /未提交|分歧/);
});

test('rehearsals use each case’s in-person arguments, respond to earlier turns, and retain valid evidence', async () => {
  const hotpot = presets.find(item => item.id === 'case-hotpot-potato');
  const funeral = presets.find(item => item.id === 'case-cyber-funeral');
  const sessions = [];
  for (const dossier of [hotpot, funeral]) {
    let session = await finishArguments(createCourtSession(dossier));
    const plaintiff = session.turns.find(turn => turn.speaker === 'plaintiff');
    const original = dossier.turns.find(turn => turn.speaker === 'plaintiff');
    assert.equal(plaintiff.text, original.text);
    assert.equal(session.ruling, undefined);
    assert.ok(session.turns.filter(turn => turn.phase === 'inquiry' && turn.speaker !== 'judge').every(turn => turn.responseTo.some(id => session.turns.some(earlier => earlier.id === id && earlier.speaker !== turn.speaker))));
    assert.ok(session.turns.every(turn => turn.evidenceIds.every(id => session.evidences.some(item => item.id === id))));
    assert.ok(session.turns.some(turn => turn.speaker === 'plaintiff' && turn.emotion !== 'normal'));
    session = await advanceCourtSession(castJuryVote(session, 'defendant'));
    assert.equal(session.ruling.winner, 'defendant');
    assert.notEqual(session.ruling.result, dossier.defendantVerdict.result);
    assert.ok(session.ruling.reasons.join('').includes(dossier.evidences[0].description));
    sessions.push(session);
  }
  assert.match(sessions[0].turns[1].text, /土豆|鸭肠/);
  assert.match(sessions[1].turns[1].text, /姑姑|怀念|电话|朋友圈/);
  assert.notEqual(sessions[0].turns[1].text, sessions[1].turns[1].text);
});

test('cast styles affect spoken rehearsal dialogue while case identities stay intact', async () => {
  const openings = [];
  for (const cast of ['everyday', 'city', 'night']) {
    const dossier = structuredClone(presets[0]);
    for (const role of ['judge', 'plaintiff', 'defendant']) dossier.agents[role].id = `cast:${cast}:${role}`;
    let session = await advanceCourtSession(createCourtSession(dossier));
    openings.push(session.turns[0].text);
    session = await advanceCourtSession(session);
    assert.equal(session.turns[1].speakerName, dossier.plaintiffName);
    assert.ok(session.turns[1].text.includes(dossier.turns.find(turn => turn.speaker === 'plaintiff').text));
  }
  assert.equal(new Set(openings).size, 3);
});

test('new evidence and questions require targeted responses from both parties before a judge rules', async () => {
  let session = await advanceCourtSession(createCourtSession(caseData));
  const initial = jsonSnapshot(session);
  session = submitCourtIntervention(session, { kind: 'evidence', text: '请核对这张收据', evidence: { id: 'new-receipt', name: '购买收据', description: '收据付款人为小陈，但不能证明其取走奶茶。', icon: '🧾', owner: 'defendant' } });
  assert.equal(JSON.parse(initial).interventions.length, 0);
  const evidenceInput = session.interventions[0];
  session = submitCourtIntervention(session, { kind: 'question', text: '是否明确征得同意？' });
  assert.equal(typeof session.interventions[1].timestamp, 'number');
  assert.throws(() => applyExternalCourtTurn(session, publicTurn('plaintiff')), { code: 'INVALID_RESPONSE' });
  for (const role of ['plaintiff', 'defendant', 'judge']) {
    session = await advanceCourtSession(session);
    const turn = session.turns[session.turns.length - 1];
    assert.equal(turn.speaker, role);
    assert.ok(turn.responseTo.includes(evidenceInput.id));
    assert.ok(turn.evidenceIds.includes('new-receipt'));
    assert.match(turn.text, /收据/);
  }
  const questionId = session.interventions[1].id;
  for (const role of ['plaintiff', 'defendant', 'judge']) {
    session = await advanceCourtSession(session);
    assert.equal(session.turns[session.turns.length - 1].speaker, role);
    assert.ok(session.turns[session.turns.length - 1].responseTo.includes(questionId));
    assert.match(session.turns[session.turns.length - 1].text, /征得同意/);
  }
  session = await finishArguments(session);
  session = await advanceCourtSession(castJuryVote(session, 'plaintiff'));
  assert.equal(session.ruling.winner, 'plaintiff');
  assert.ok(session.ruling.evidenceIds.includes('new-receipt'));
  assert.deepEqual(session.ruling.consideredInterventionIds, session.interventions.map(i => i.id));
});

test('materials filed before opening preserve the judge’s first turn and input arrival order', async () => {
  let session = createCourtSession(caseData);
  session = submitCourtIntervention(session, { kind: 'question', text: '第一份案前材料' });
  session = submitCourtIntervention(session, { kind: 'question', text: '第二份案前材料' });
  const [first, second] = session.interventions;
  assert.equal(getNextCourtRole(session), 'judge');
  session = await advanceCourtSession(session);
  assert.equal(session.turns[0].phase, 'opening');
  for (const input of [first, second]) for (const role of ['plaintiff', 'defendant', 'judge']) {
    session = await advanceCourtSession(session);
    const latest = session.turns[session.turns.length - 1];
    assert.equal(latest.speaker, role);
    assert.ok(latest.responseTo.includes(input.id));
  }
  assert.deepEqual(validateCourtSession(session).pendingTurns, session.pendingTurns);
});

test('jury vote gates final ruling, cannot be recast and cannot be overruled by external agent', async () => {
  let session = await finishArguments(createCourtSession(caseData));
  assert.throws(() => applyExternalCourtRuling(session, publicTurn('judge')), { code: 'INVALID_STATE' });
  session = castJuryVote(session, 'plaintiff');
  assert.equal(getNextCourtRole(session), 'judge');
  assert.throws(() => castJuryVote(session, 'defendant'), { code: 'INVALID_STATE' });
  assert.throws(() => submitCourtIntervention(session, { kind: 'opinion', text: '投票后不得改材料' }), { code: 'INVALID_STATE' });
  const good = (await advanceCourtSession(session)).ruling;
  assert.throws(() => applyExternalCourtRuling(session, { ...publicTurn('judge', { evidenceIds: good.evidenceIds }), ruling: { ...good, winner: 'defendant' } }), { code: 'INVALID_RESPONSE' });
  session = applyExternalCourtRuling(session, { ...publicTurn('judge', { evidenceIds: good.evidenceIds }), ruling: good });
  assert.equal(session.status, 'completed');
  assert.equal(session.turns[session.turns.length - 1].speaker, 'judge');
});

test('appeal preserves original ruling and reasons, clears vote, and restarts the three-party exchange', async () => {
  const completed = await advanceCourtSession(castJuryVote(await finishArguments(createCourtSession(caseData)), 'defendant'));
  const original = jsonSnapshot(completed);
  let appeal = createAppealSession(completed, '收据不能证明取走奶茶', 'plaintiff');
  assert.equal(jsonSnapshot(completed), original);
  assert.deepEqual(appeal.appeal.originalRuling, completed.ruling);
  assert.equal(appeal.appeal.reason, '收据不能证明取走奶茶');
  assert.notEqual(appeal.id, completed.id);
  assert.equal(appeal.juryVote, undefined);
  assert.equal(appeal.ruling, undefined);
  assert.equal(appeal.turns.length, 0);
  appeal = await advanceCourtSession(appeal);
  assert.match(appeal.turns[0].text, /重审/);
  assert.match(appeal.turns[0].text, /收据不能证明/);
  assert.equal(getNextCourtRole(appeal), 'plaintiff');
  assert.equal(validateCourtSession(appeal).appeal.originalSessionId, completed.id);
});

test('balance derives from unique accepted turns, ignores external scores and survives serialization', async () => {
  let session = await finishArguments(createCourtSession(caseData));
  const balance = getCourtBalance(session);
  assert.equal(balance, 5);
  assert.equal(getCourtBalance({ ...session, turns: [...session.turns, ...session.turns] }), balance);
  const tampered = JSON.parse(JSON.stringify(session));
  tampered.turns.forEach(t => { t.tiltChange = 100; t.agentThought = 'private'; });
  tampered.apiKey = 'discard-me';
  tampered.caseData.apiKey = 'discard-me';
  tampered.caseData.turns = [{ text: 'future secret' }];
  const restored = validateCourtSession(tampered);
  assert.equal(getCourtBalance(restored), balance);
  assert.equal(JSON.stringify(restored).includes('discard-me'), false);
  assert.equal(JSON.stringify(restored).includes('private'), false);
  assert.deepEqual(restored.caseData.turns, []);
  assert.equal(getCourtRoleProfile(restored.caseData, 'judge').name, '沈衡');
  assert.equal(getCourtRoleProfile(restored.caseData, 'judge').avatar, '/casts/judge.png');
  assert.throws(() => validateCourtSession({ ...tampered, turns: [...tampered.turns, tampered.turns[0]] }), { code: 'INVALID_STATE' });
  const wrongRole = JSON.parse(JSON.stringify(session));
  wrongRole.turns[0].speaker = 'defendant';
  assert.throws(() => validateCourtSession(wrongRole), { code: 'INVALID_RESPONSE' });
});

test('live mode makes one compatible request per turn with shared occurred transcript and no future script', async () => {
  const requests = [];
  await withApi(async (req, res) => {
    let text = ''; for await (const part of req) text += part;
    const body = JSON.parse(text); requests.push({ path: req.url, auth: req.headers.authorization, body });
    answer(res, publicTurn(requests.length === 1 ? 'judge' : 'plaintiff'));
  }, async config => {
    let session = createCourtSession(caseData, 'live');
    session = await advanceCourtSession(session, config);
    assert.equal(session.turns.length, 1);
    assert.equal(requests.length, 1);
    session = await advanceCourtSession(session, config);
    assert.equal(session.turns.length, 2);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].path, '/v1/chat/completions');
    assert.equal(requests[0].auth, `Bearer ${config.apiKey}`);
    assert.equal(requests[0].body.model, config.modelName);
    assert.equal(JSON.parse(requests[0].body.messages[1].content).transcript.length, 0);
    assert.equal(JSON.parse(requests[1].body.messages[1].content).transcript[0].speaker, 'judge');
    assert.equal(JSON.stringify(requests).includes('future-secret'), false);
    assert.equal(JSON.stringify(requests).includes('不能直接读取的预置结局'), false);
    assert.equal(JSON.stringify(session).includes(config.apiKey), false);
  });
});

test('live mode never silently falls back after missing configuration, HTTP, malformed or wrong-role responses', async () => {
  const session = createCourtSession(caseData, 'live');
  const initial = jsonSnapshot(session);
  await assert.rejects(() => advanceCourtSession(session), { code: 'CONFIG' });
  for (const [handler, code] of [
    [(req, _res) => req.socket.destroy(), 'NETWORK'],
    [(_req, res) => { res.writeHead(401); res.end('key rejected'); }, 'HTTP'],
    [(_req, res) => { res.writeHead(200); res.end('broken'); }, 'INVALID_RESPONSE'],
    [(_req, res) => { res.end(JSON.stringify({ choices: [{ message: { content: 'not json' } }] })); }, 'INVALID_RESPONSE'],
    [(_req, res) => answer(res, publicTurn('defendant')), 'INVALID_RESPONSE'],
    [(_req, res) => answer(res, publicTurn('judge', { evidenceIds: ['invented'] })), 'INVALID_RESPONSE'],
  ]) await withApi(handler, async config => {
    await assert.rejects(() => advanceCourtSession(session, config), { code });
    assert.equal(jsonSnapshot(session), initial);
  });
});

test('live final role receives jury vote and must announce its supported party', async () => {
  let session = createCourtSession(caseData, 'live');
  while (session.pendingTurns.length) session = applyExternalCourtTurn(session, publicTurn(getNextCourtRole(session)));
  session = castJuryVote(session, 'defendant');
  const initial = jsonSnapshot(session);
  const ruling = { winner: 'plaintiff', result: '模型给出的裁决', penalty: [], quote: '公开理由', reasons: ['只依本庭材料宣判'], evidenceIds: ['original-1'], consideredInterventionIds: [] };
  await withApi(async (req, res) => {
    let text = ''; for await (const part of req) text += part;
    const request = JSON.parse(text);
    assert.equal(JSON.parse(request.messages[1].content).juryVote, 'defendant');
    answer(res, { ...publicTurn('judge', { evidenceIds: ['original-1'] }), ruling });
  }, async config => {
    await assert.rejects(() => advanceCourtSession(session, config), { code: 'INVALID_RESPONSE' });
    assert.equal(jsonSnapshot(session), initial);
  });
  ruling.winner = 'defendant';
  await withApi((_req, res) => answer(res, { ...publicTurn('judge', { evidenceIds: ['original-1'] }), ruling }), async config => {
    const completed = await advanceCourtSession(session, config);
    assert.equal(completed.ruling.winner, 'defendant');
    assert.equal(completed.turns.length, session.turns.length + 1);
    assert.equal(completed.status, 'completed');
  });
});

test('pre-cancel, in-flight cancellation, and timeouts reject without accepting a turn', async () => {
  const session = createCourtSession(caseData, 'live');
  const before = new AbortController(); before.abort();
  await assert.rejects(() => advanceCourtSession(session, undefined, before.signal), { code: 'ABORTED' });
  await withApi((_req, _res) => {}, async config => {
    const controller = new AbortController();
    const pending = advanceCourtSession(session, config, controller.signal);
    controller.abort();
    await assert.rejects(() => pending, { code: 'ABORTED' });
    await assert.rejects(() => advanceCourtSession(session, { ...config, timeoutMs: 15 }), { code: 'TIMEOUT' });
    assert.equal(session.turns.length, 0);
    assert.equal(session.mode, 'live');
  });
});

test('serialized completed and interrupted trials restore by replaying required responses and jury vote', async () => {
  let session = await advanceCourtSession(createCourtSession(caseData));
  session = submitCourtIntervention(session, { kind: 'question', text: '请解释拍照时间' });
  session = await advanceCourtSession(session);
  const restored = validateCourtSession(JSON.parse(JSON.stringify(session)));
  assert.equal(getNextCourtRole(restored), 'defendant');
  assert.deepEqual(restored.pendingTurns, session.pendingTurns);
  session = await finishArguments(restored);
  session = castJuryVote(session, 'defendant');
  assert.equal(validateCourtSession(session).juryVote, 'defendant');
  session = await advanceCourtSession(session);
  const completed = validateCourtSession(JSON.parse(JSON.stringify(session)));
  assert.deepEqual(completed.ruling, session.ruling);
  assert.equal(completed.status, 'completed');
  const forged = JSON.parse(JSON.stringify(session)); forged.juryVote = 'plaintiff';
  assert.throws(() => validateCourtSession(forged), { code: 'INVALID_RESPONSE' });
});
