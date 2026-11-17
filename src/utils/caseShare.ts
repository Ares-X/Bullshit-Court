import type { CourtSession } from '../types';

/** Public snapshots are encoded, never encrypted. Credentials are never copied. */
export const MAX_CASE_SNAPSHOT_BYTES = 180_000;
export const MAX_CASE_SHARE_URL_LENGTH = 250_000;
type Schema = 'string' | 'number' | 'boolean' | readonly string[] | { [key: string]: Schema } | { array: Schema };
const evidence = { id: 'string', name: 'string', description: 'string', icon: 'string', owner: ['plaintiff', 'defendant'] } as const;
const verdict = { result: 'string', penalty: { array: 'string' }, quote: 'string' } as const;
const ruling = { ...verdict, winner: ['plaintiff', 'defendant', 'draw'], reasons: { array: 'string' }, evidenceIds: { array: 'string' }, consideredInterventionIds: { array: 'string' } } as const;
const dialogue = { id: 'string', speaker: ['judge', 'plaintiff', 'defendant', 'jury', 'clerk'], speakerName: 'string', avatar: 'string', text: 'string', emotion: ['normal', 'confident', 'angry', 'shocked', 'smug', 'sweating', 'gavel'], 'shout?': ['OBJECTION', 'HOLD_IT', 'TAKE_THAT', 'ORDER'], 'evidence?': evidence, tiltChange: 'number', 'danmaku?': { array: 'string' } } as const;
const phase = ['opening', 'statements', 'inquiry', 'evidence', 'deliberation', 'verdict'] as const;
const profile = { id: 'string', name: 'string', model: 'string', persona: 'string', avatar: 'string' } as const;
const schema: Schema = {
  version: 'number', id: 'string', mode: ['rehearsal', 'live', 'external'],
  caseData: { id: 'string', title: 'string', caseNumber: 'string', category: ['美食争端', '友谊塑料', '社交礼仪', '当代玄学', '猎奇幽默', '赛博荒诞', '职场黑洞'], tags: { array: 'string' }, summary: 'string', plaintiffName: 'string', plaintiffTitle: 'string', defendantName: 'string', defendantTitle: 'string', coreClash: 'string', evidences: { array: evidence }, turns: { array: dialogue }, plaintiffVerdict: verdict, defendantVerdict: verdict, 'agents?': { plaintiff: profile, defendant: profile, judge: profile } },
  turns: { array: { ...dialogue, speaker: ['judge', 'plaintiff', 'defendant'], phase, responseTo: { array: 'string' }, evidenceIds: { array: 'string' } } },
  evidences: { array: evidence }, interventions: { array: { id: 'string', kind: ['question', 'evidence', 'opinion'], text: 'string', timestamp: 'number', 'evidence?': evidence, 'afterTurnId?': 'string' } },
  pendingTurns: { array: { role: ['judge', 'plaintiff', 'defendant'], phase, interventionIds: { array: 'string' } } },
  'juryVote?': ['plaintiff', 'defendant'], phase, status: ['active', 'awaiting-ruling', 'completed'], rulingRequested: 'boolean', 'ruling?': ruling,
  'appeal?': { reason: 'string', role: ['plaintiff', 'defendant'], originalSessionId: 'string', originalRuling: ruling },
};
function project(value: unknown, spec: Schema, depth = 0): unknown {
  if (depth > 18) throw new Error('案件快照嵌套过深');
  if (typeof spec === 'string') {
    if (typeof value !== spec || (typeof value === 'number' && !Number.isFinite(value)) || (typeof value === 'string' && value.length > 40_000)) throw new Error('案件快照字段格式无效');
    return value;
  }
  if (Array.isArray(spec)) {
    if (!spec.includes(value as string)) throw new Error('案件快照枚举值无效');
    return value;
  }
  const objectSpec = spec as { [key: string]: Schema };
  if ('array' in objectSpec) {
    if (!Array.isArray(value) || value.length > 600) throw new Error('案件快照列表无效或过长');
    return value.map(item => project(item, objectSpec.array, depth + 1));
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('案件快照对象无效');
  const result: Record<string, unknown> = {};
  for (const [field, child] of Object.entries(objectSpec)) {
    const optional = field.endsWith('?'); const key = optional ? field.slice(0, -1) : field;
    const item = (value as Record<string, unknown>)[key];
    if (optional && item === undefined) continue;
    result[key] = project(item, child, depth + 1);
  }
  return result;
}
export function sanitizeCourtSession(value: unknown): CourtSession {
  const result = project(value, schema) as CourtSession;
  if (result.version !== 1 || !result.id || (result.status === 'completed' && !result.ruling)) throw new Error('案件快照版本或状态无效');
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_CASE_SNAPSHOT_BYTES) throw new Error('案件快照过大，请减少记录后分享');
  return result;
}
export function createCaseShareUrl(session: CourtSession, baseUrl = window.location.href): string {
  const json = JSON.stringify({ version: 1, session: sanitizeCourtSession(session) });
  const bytes = new TextEncoder().encode(json);
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const url = new URL(baseUrl); url.search = ''; url.username = ''; url.password = ''; url.hash = `court=v1.${encoded}`;
  if (url.href.length > MAX_CASE_SHARE_URL_LENGTH) throw new Error('分享链接过长，请减少记录后分享');
  return url.href;
}
export function readCaseShareUrl(input = window.location.href): CourtSession | null {
  if (input.length > MAX_CASE_SHARE_URL_LENGTH) throw new Error('分享链接超出大小限制');
  const hash = new URL(input).hash.slice(1);
  if (!hash.startsWith('court=')) return null;
  if (!hash.startsWith('court=v1.')) throw new Error('不支持的分享版本');
  const encoded = hash.slice('court=v1.'.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('分享链接编码无效');
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    if (bytes.length > MAX_CASE_SNAPSHOT_BYTES + 100) throw new Error('案件快照过大');
    const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (envelope.version !== 1) throw new Error('不支持的分享版本');
    return sanitizeCourtSession(envelope.session);
  } catch (error) { throw new Error(`分享链接内容无效或超过限制：${error instanceof Error ? error.message : '未知格式'}`); }
}
