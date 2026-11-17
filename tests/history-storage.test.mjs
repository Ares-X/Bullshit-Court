import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const temp = await mkdtemp(join(tmpdir(), 'court-history-test-'));
let history, court;
try {
  for (const name of ['presetCases', 'courtRuntime', 'historyStorage']) {
    const source = await readFile(new URL(`../src/${name === 'presetCases' ? 'data' : 'utils'}/${name}.ts`, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
    await writeFile(join(temp, `${name}.mjs`), compiled.replaceAll("'./courtRuntime'", "'./courtRuntime.mjs'").replace("'../data/presetCases'", "'./presetCases.mjs'"));
  }
  court = await import(pathToFileURL(join(temp, 'courtRuntime.mjs')).href);
  history = await import(pathToFileURL(join(temp, 'historyStorage.mjs')).href);
} finally { await rm(temp, { recursive: true, force: true }); }
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
after(() => { if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage); else delete globalThis.localStorage; });
const HISTORY_KEY = 'internet_court_history_records';
const DRAFT_KEY = 'internet_court_current_session_v1';
function installStorage() {
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: key => { values.delete(key); },
  } });
  return values;
}
const dossier = {
  id: 'legacy-case', title: '谁动了奶茶', caseNumber: 'TEST-001', category: '友谊塑料', tags: ['室友'], summary: '小林与小陈对奶茶归属有争议。',
  plaintiffName: '小林', plaintiffTitle: '室友甲', defendantName: '小陈', defendantTitle: '室友乙', coreClash: '奶茶是否得到同意后被取走',
  evidences: [], turns: [{ id: 'legacy-turn', speaker: 'plaintiff', speakerName: '小林', avatar: '🧑', text: '这是旧版预设剧本。', emotion: 'normal', tiltChange: 4, agentThought: 'must-not-persist' }],
  plaintiffVerdict: { result: '旧版原告判词', penalty: ['旧版建议'], quote: '旧版摘要' },
  defendantVerdict: { result: '旧版被告判词', penalty: [], quote: '旧版摘要' },
};
const legacyRecord = (id = 'legacy-record') => ({ id, timestamp: 1700000000000, caseData: dossier, winner: 'draw', finalScaleBalance: 0, verdictResult: '旧版记录的结论', caseNumber: 'TEST-001' });
async function completedSession() {
  let session = court.createCourtSession(dossier);
  while (session.pendingTurns.length) session = await court.advanceCourtSession(session);
  return court.advanceCourtSession(court.castJuryVote(session, 'plaintiff'));
}
const sessionRecord = session => ({ ...legacyRecord('caller-id-is-ignored'), session, winner: 'defendant', finalScaleBalance: 100, verdictResult: 'caller-result-is-ignored' });

test('legacy records remain readable and preserve their explicitly preset script', () => {
  const values = installStorage();
  values.set(HISTORY_KEY, JSON.stringify([legacyRecord()]));
  const [record] = history.getTrialRecords();
  assert.equal(record.winner, 'draw');
  assert.equal(record.session, undefined);
  assert.equal(record.caseData.turns[0].text, '这是旧版预设剧本。');
  assert.equal(record.caseData.turns[0].agentThought, undefined);
  assert.equal(record.caseData.plaintiffVerdict.result, '旧版原告判词');
  assert.equal(history.getCourtStorageError(), null);
  assert.equal(history.saveTrialRecord(record), true);
  assert.equal(values.get(HISTORY_KEY).includes('must-not-persist'), false);
});

test('completed session is authoritative, sanitized, and idempotent by session ID', async () => {
  const values = installStorage();
  const session = await completedSession();
  session.apiKey = 'secret-do-not-write';
  session.caseData.apiKey = 'secret-do-not-write';
  session.turns[0].agentThought = 'hidden-do-not-write';
  assert.equal(history.saveTrialRecord(sessionRecord(session)), true);
  assert.equal(history.saveTrialRecord({ ...sessionRecord(session), id: 'another-id', timestamp: 1900000000000 }), true);
  const records = history.getTrialRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0].id, session.id);
  assert.equal(records[0].timestamp, 1700000000000);
  assert.equal(records[0].winner, 'plaintiff');
  assert.equal(records[0].verdictResult, session.ruling.result);
  assert.equal(records[0].session.turns.length, session.turns.length);
  assert.equal(values.get(HISTORY_KEY).includes('secret-do-not-write'), false);
  assert.equal(values.get(HISTORY_KEY).includes('hidden-do-not-write'), false);
  assert.deepEqual(court.validateCourtSession(records[0].session).ruling, session.ruling);
});

test('invalid new snapshot never contaminates previously saved history or draft', async () => {
  const values = installStorage();
  const session = await completedSession();
  assert.equal(history.saveTrialRecord(sessionRecord(session)), true);
  assert.equal(history.saveCourtDraft(session), true);
  const originalHistory = values.get(HISTORY_KEY), originalDraft = values.get(DRAFT_KEY);
  const invalid = JSON.parse(JSON.stringify(session)); invalid.turns[0].speaker = 'defendant';
  assert.equal(history.saveTrialRecord(sessionRecord(invalid)), false);
  assert.match(history.getCourtStorageError(), /未保存/);
  assert.equal(values.get(HISTORY_KEY), originalHistory);
  assert.equal(history.saveCourtDraft(invalid), false);
  assert.equal(values.get(DRAFT_KEY), originalDraft);
});

test('partly damaged records return valid entries without silently removing damaged originals', () => {
  const values = installStorage();
  const raw = JSON.stringify([legacyRecord(), { broken: 'keep this recovery evidence' }]);
  values.set(HISTORY_KEY, raw);
  assert.equal(history.getTrialRecords().length, 1);
  assert.match(history.getCourtStorageError(), /1 份案卷无法读取/);
  assert.equal(history.saveTrialRecord(legacyRecord('new-record')), false);
  assert.equal(values.get(HISTORY_KEY), raw);
  assert.equal(history.deleteTrialRecord('legacy-record'), true);
  assert.deepEqual(JSON.parse(values.get(HISTORY_KEY)), [{ broken: 'keep this recovery evidence' }]);
  values.set(HISTORY_KEY, '{ damaged JSON');
  assert.deepEqual(history.getTrialRecords(), []);
  assert.match(history.getCourtStorageError(), /原始数据未被修改/);
  assert.equal(history.saveTrialRecord(legacyRecord()), false);
  assert.equal(values.get(HISTORY_KEY), '{ damaged JSON');
});

test('capacity limits refuse a new record instead of pruning existing user history', () => {
  const values = installStorage();
  const existing = Array.from({ length: history.MAX_HISTORY_RECORDS }, (_, index) => legacyRecord(`old-${index}`));
  values.set(HISTORY_KEY, JSON.stringify(existing));
  const original = values.get(HISTORY_KEY);
  assert.equal(history.saveTrialRecord(legacyRecord('new-overflow')), false);
  assert.match(history.getCourtStorageError(), /案卷已满/);
  assert.equal(values.get(HISTORY_KEY), original);
  assert.equal(history.saveTrialRecord(legacyRecord('old-1')), true);
  assert.equal(history.getTrialRecords().length, history.MAX_HISTORY_RECORDS);
});

test('current progress can be resumed and cleared independently of historical records', async () => {
  const values = installStorage();
  assert.equal(history.saveTrialRecord(legacyRecord()), true);
  let session = court.createCourtSession(dossier);
  session = await court.advanceCourtSession(session);
  session = court.submitCourtIntervention(session, { kind: 'question', text: '请说明奶茶的购买时间' });
  assert.equal(history.saveCourtDraft(session), true);
  const restored = history.getCourtDraft();
  assert.equal(restored.turns.length, 1);
  assert.equal(court.getNextCourtRole(restored), 'plaintiff');
  assert.deepEqual(restored.pendingTurns, session.pendingTurns);
  assert.equal(history.clearCourtDraft(), true);
  assert.equal(history.getCourtDraft(), null);
  assert.equal(history.getTrialRecords().length, 1);
  assert.equal(values.has(HISTORY_KEY), true);
  values.set(DRAFT_KEY, '{ broken draft');
  assert.equal(history.getCourtDraft(), null);
  assert.equal(values.get(DRAFT_KEY), '{ broken draft');
  assert.match(history.getCourtStorageError(), /原始数据仍保留/);
  assert.equal(history.saveCourtDraft(session), false);
  assert.equal(values.get(DRAFT_KEY), '{ broken draft');
  assert.match(history.getCourtStorageError(), /本次未覆盖/);
});

test('blocked browser storage and quota failures produce readable errors without crashes', () => {
  const values = installStorage();
  assert.equal(history.saveTrialRecord(legacyRecord()), true);
  const original = values.get(HISTORY_KEY);
  globalThis.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(history.saveTrialRecord(legacyRecord('new')), false);
  assert.equal(values.get(HISTORY_KEY), original);
  assert.match(history.getCourtStorageError(), /QuotaExceededError/);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  assert.deepEqual(history.getTrialRecords(), []);
  assert.equal(history.getCourtDraft(), null);
  assert.match(history.getCourtStorageError(), /SecurityError/);
  assert.equal(history.clearCourtDraft(), false);
});
