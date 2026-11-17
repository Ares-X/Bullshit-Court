import type { CaseData, CourtSession, DialogueTurn, Evidence } from '../types';
import { createCourtSession, getCourtBalance, validateCourtSession } from './courtRuntime';

export interface TrialRecord {
  id: string;
  timestamp: number;
  caseData: CaseData;
  winner: 'plaintiff' | 'defendant' | 'draw';
  finalScaleBalance: number;
  verdictResult: string;
  caseNumber: string;
  session?: CourtSession;
}

const STORAGE_KEY = 'internet_court_history_records';
const DRAFT_KEY = 'internet_court_current_session_v1';
export const MAX_HISTORY_BYTES = 3_000_000;
export const MAX_DRAFT_BYTES = 800_000;
export const MAX_HISTORY_RECORDS = 50;
let storageError: string | null = null;
export function getCourtStorageError(): string | null { return storageError; }
function fail(message: string, cause?: unknown): false {
  storageError = `${message}${cause instanceof SyntaxError ? '：存储内容不是有效 JSON' : cause instanceof Error ? `：${cause.message}` : ''}`;
  return false;
}
function storage(): Storage {
  if (typeof globalThis.localStorage === 'undefined') throw new Error('当前环境不支持本地存储');
  return globalThis.localStorage;
}
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('记录不是有效对象');
  return input as Record<string, unknown>;
}
function text(input: unknown, label: string, max = 12000): string {
  if (typeof input !== 'string' || !input.trim() || input.length > max) throw new Error(`${label}无效`);
  return input;
}
function texts(input: unknown): string[] {
  if (!Array.isArray(input) || input.length > 600 || !input.every(item => typeof item === 'string' && item.length <= 12000)) throw new Error('文本列表无效');
  return input.slice();
}
function evidence(input: unknown): Evidence {
  const item = object(input);
  if (item.owner !== 'plaintiff' && item.owner !== 'defendant') throw new Error('证物归属无效');
  return { id: text(item.id, '证物编号', 500), name: text(item.name, '证物名称', 500), description: text(item.description, '证物描述'), icon: text(item.icon, '证物图标', 100), owner: item.owner };
}
function legacyTurn(input: unknown): DialogueTurn {
  const turn = object(input);
  if (!['judge', 'plaintiff', 'defendant', 'jury', 'clerk'].includes(turn.speaker as string) || !['normal', 'confident', 'angry', 'shocked', 'smug', 'sweating', 'gavel'].includes(turn.emotion as string) || typeof turn.tiltChange !== 'number' || !Number.isFinite(turn.tiltChange)) throw new Error('旧版剧本发言格式无效');
  const result: DialogueTurn = { id: text(turn.id, '发言编号', 500), speaker: turn.speaker as DialogueTurn['speaker'], speakerName: text(turn.speakerName, '发言者', 500), avatar: text(turn.avatar, '头像', 3000), text: text(turn.text, '发言内容'), emotion: turn.emotion as DialogueTurn['emotion'], tiltChange: Math.max(-25, Math.min(25, turn.tiltChange)) };
  if (turn.evidence !== undefined) result.evidence = evidence(turn.evidence);
  if (turn.danmaku !== undefined) result.danmaku = texts(turn.danmaku);
  if (turn.shout !== undefined) {
    if (!['OBJECTION', 'HOLD_IT', 'TAKE_THAT', 'ORDER'].includes(turn.shout as string)) throw new Error('旧版剧本提示格式无效');
    result.shout = turn.shout as DialogueTurn['shout'];
  }
  return result;
}
function legacyCase(input: unknown): CaseData {
  const raw = object(input);
  // Reuse the court owner's dossier validation while keeping legacy scripts explicitly separate.
  const clean = validateCourtSession(createCourtSession(raw as unknown as CaseData)).caseData;
  if (!Array.isArray(raw.turns) || raw.turns.length > 600) throw new Error('旧版预设剧本无效');
  clean.turns = raw.turns.map(legacyTurn);
  for (const key of ['plaintiffVerdict', 'defendantVerdict'] as const) {
    const verdict = object(raw[key]);
    clean[key] = { result: text(verdict.result, '旧版判词'), penalty: texts(verdict.penalty), quote: text(verdict.quote, '旧版判词摘要') };
  }
  return clean;
}
function normalizeRecord(input: unknown): TrialRecord {
  const record = object(input);
  if (typeof record.timestamp !== 'number' || !Number.isFinite(record.timestamp) || record.timestamp < 0) throw new Error('归档时间无效');
  if (record.session !== undefined) {
    const session = validateCourtSession(record.session);
    if (session.status !== 'completed' || !session.ruling) throw new Error('只有法官已宣判的完整庭审可以归档');
    return { id: session.id, timestamp: record.timestamp, caseData: session.caseData, session, winner: session.ruling.winner,
      finalScaleBalance: getCourtBalance(session), verdictResult: session.ruling.result, caseNumber: session.caseData.caseNumber };
  }
  if (!['plaintiff', 'defendant', 'draw'].includes(record.winner as string) || typeof record.finalScaleBalance !== 'number' || !Number.isFinite(record.finalScaleBalance)) throw new Error('旧案卷裁决资料无效');
  const caseData = legacyCase(record.caseData);
  return { id: text(record.id, '案卷编号', 500), timestamp: record.timestamp, caseData, winner: record.winner as TrialRecord['winner'],
    finalScaleBalance: Math.max(-100, Math.min(100, record.finalScaleBalance)), verdictResult: text(record.verdictResult, '裁决结论'), caseNumber: text(record.caseNumber, '案号', 500) };
}
function bytes(json: string): number { return new TextEncoder().encode(json).length; }
function readHistory(): { raw: unknown[]; records: TrialRecord[]; invalid: number } {
  const json = storage().getItem(STORAGE_KEY);
  if (!json) return { raw: [], records: [], invalid: 0 };
  if (bytes(json) > MAX_HISTORY_BYTES * 2) throw new Error('历史数据过大，原始内容已保留');
  const raw: unknown = JSON.parse(json);
  if (!Array.isArray(raw)) throw new Error('历史记录格式损坏，原始内容已保留');
  const records: TrialRecord[] = [];
  let invalid = 0;
  for (const item of raw) {
    try { records.push(normalizeRecord(item)); } catch { invalid++; }
  }
  return { raw, records, invalid };
}

export function getTrialRecords(): TrialRecord[] {
  storageError = null;
  try {
    const { records, invalid } = readHistory();
    if (invalid) fail(`有 ${invalid} 份案卷无法读取；已显示其余有效记录，原始数据仍保留`);
    return records;
  } catch (cause) { fail('无法读取历史案卷，原始数据未被修改', cause); return []; }
}

export function saveTrialRecord(input: TrialRecord): boolean {
  storageError = null;
  try {
    const record = normalizeRecord(input);
    const existing = readHistory();
    if (existing.invalid) return fail('历史含损坏记录，为保留原始数据，本次未覆盖归档');
    const previous = existing.records.find(item => item.id === record.id);
    if (previous) record.timestamp = previous.timestamp;
    const updated = [record, ...existing.records.filter(item => item.id !== record.id)];
    if (updated.length > MAX_HISTORY_RECORDS) return fail('案卷已满，请在档案馆手动删除不再需要的记录后归档');
    const json = JSON.stringify(updated);
    if (bytes(json) > MAX_HISTORY_BYTES) return fail('案卷超过本地容量限制，本次未保存；已有记录仍保留');
    storage().setItem(STORAGE_KEY, json);
    return true;
  } catch (cause) { return fail('案卷未保存，已有数据未被覆盖', cause); }
}

export function deleteTrialRecord(id: string): boolean {
  storageError = null;
  try {
    const existing = readHistory();
    // An explicit UI deletion removes its matching record only, preserving unreadable neighbors.
    const updated = existing.raw.filter(item => {
      try { return normalizeRecord(item).id !== id; } catch { return true; }
    });
    storage().setItem(STORAGE_KEY, JSON.stringify(updated));
    return true;
  } catch (cause) { return fail('未能删除案卷，原始数据仍保留', cause); }
}
export function clearAllTrialRecords(): boolean {
  storageError = null;
  try { storage().removeItem(STORAGE_KEY); return true; }
  catch (cause) { return fail('未能清空案卷', cause); }
}
export function saveCourtDraft(input: CourtSession): boolean {
  storageError = null;
  try {
    const session = validateCourtSession(input);
    const json = JSON.stringify(session);
    if (bytes(json) > MAX_DRAFT_BYTES) return fail('当前庭审超过进度保存容量限制，之前的进度仍保留');
    const previous = storage().getItem(DRAFT_KEY);
    if (previous) {
      try {
        if (bytes(previous) > MAX_DRAFT_BYTES) throw new Error('旧进度超过容量限制');
        validateCourtSession(JSON.parse(previous));
      } catch {
        return fail('已有庭审进度无法读取；为保留恢复材料，本次未覆盖，请明确清除旧进度后再保存');
      }
    }
    storage().setItem(DRAFT_KEY, json);
    return true;
  } catch (cause) { return fail('当前庭审进度未保存，之前的进度仍保留', cause); }
}
export function getCourtDraft(): CourtSession | null {
  storageError = null;
  try {
    const json = storage().getItem(DRAFT_KEY);
    if (!json) return null;
    if (bytes(json) > MAX_DRAFT_BYTES) throw new Error('进度超过容量限制');
    return validateCourtSession(JSON.parse(json));
  } catch (cause) { fail('无法恢复庭审进度，原始数据仍保留', cause); return null; }
}
export function clearCourtDraft(): boolean {
  storageError = null;
  try { storage().removeItem(DRAFT_KEY); return true; }
  catch (cause) { return fail('未能清除当前庭审进度', cause); }
}
