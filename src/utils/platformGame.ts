import type { CourtScheduledTurn, CourtSession } from '../types';
import type { CreateGameInput, JuryWinner } from '../types/platform';
import { applyCourtCast, COURT_CASTS } from '../data/courtCasts';

export function platformTurn(session: CourtSession, postJury: boolean | undefined): CourtScheduledTurn | undefined {
  if (session.pendingTurns.length) return session.pendingTurns[0];
  if (postJury && session.juryVote && session.status !== 'completed') {
    return { role: 'judge', phase: 'verdict', interventionIds: session.interventions.map(item => item.id) };
  }
}

export function juryTotals(votes: Record<string, JuryWinner>) {
  let plaintiff = 0, defendant = 0;
  for (const vote of Object.values(votes)) {
    if (vote === 'plaintiff') plaintiff++;
    if (vote === 'defendant') defendant++;
  }
  return { plaintiff, defendant, total: plaintiff + defendant };
}

export function platformCase(input: CreateGameInput, builtinEnabled: boolean, fail: (status: number, code: string, message: string) => never) {
  if (input.judgeMode === undefined || input.judgeMode === 'external') return { caseData: input.caseData };
  if (input.judgeMode !== 'builtin' || input.mode !== 'multiplayer' || input.role !== 'plaintiff') {
    return fail(400, 'INVALID_JUDGE_MODE', '只有多人开庭的原告可以选用内置法官。');
  }
  if (!builtinEnabled) return fail(503, 'BUILTIN_JUDGE_UNAVAILABLE', '内置法官暂未开放，请邀请法官 Agent。');
  const cast = COURT_CASTS.find(item => item.id === input.judgeCastId);
  if (!cast) return fail(400, 'INVALID_JUDGE_CAST', '请选择一位内置法官。');
  return { caseData: applyCourtCast(input.caseData, cast.id), builtinJudgeName: cast.judgeName };
}

export interface BuiltinRetry { turnId: string; attempts: number; after: number }

export function nextBuiltinRetry(turnId: string, now: number, previous?: BuiltinRetry): BuiltinRetry {
  const attempts = previous?.turnId === turnId ? previous.attempts + 1 : 1;
  const interval = Math.min(30_000 * 2 ** (attempts - 1), 300_000);
  return { turnId, attempts, after: now + interval };
}
