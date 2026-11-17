import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaseData, CourtConnectionConfig, CourtSession } from '../types';
import {
  advanceCourtSession, castJuryVote, createAppealSession, createCourtSession,
  validateCourtSession,
} from '../utils/courtRuntime';

/** The session is the sole owner of accepted turns, evidence and the jury decision. */
export function useCourtSession(initialCase: CaseData) {
  const [session, setSession] = useState(() => createCourtSession(initialCase));
  const sessionRef = useRef(session);
  const [config, setConfig] = useState<CourtConnectionConfig>();
  const configRef = useRef(config);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | null>(null);
  const revision = useRef(0);

  const commit = useCallback((next: CourtSession) => {
    revision.current += 1;
    sessionRef.current = next;
    setSession(next);
    setError(undefined);
  }, []);

  const cancel = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setBusy(false);
  }, []);

  useEffect(() => () => request.current?.abort(), []);

  const replace = useCallback((next: CourtSession) => {
    const accepted = validateCourtSession(next);
    cancel();
    commit(accepted);
  }, [cancel, commit]);

  const startCase = useCallback((caseData: CaseData) => {
    cancel();
    commit(createCourtSession(caseData, configRef.current?.apiKey ? 'live' : 'rehearsal'));
  }, [cancel, commit]);

  const configure = useCallback((connection?: CourtConnectionConfig) => {
    cancel();
    configRef.current = connection;
    setConfig(connection);
    const mode = connection?.apiKey ? 'live' : 'rehearsal';
    if (mode === 'live' && sessionRef.current.mode === 'live') {
      setError(undefined);
    } else {
      commit(createCourtSession(sessionRef.current.caseData, mode));
    }
  }, [cancel, commit]);

  const advance = useCallback(async () => {
    if (request.current || sessionRef.current.status !== 'active') return;
    const controller = new AbortController();
    request.current = controller;
    const expectedRevision = revision.current;
    const before = sessionRef.current;
    setBusy(true);
    setError(undefined);
    try {
      const next = await advanceCourtSession(before, configRef.current, controller.signal);
      if (!controller.signal.aborted && revision.current === expectedRevision) commit(next);
    } catch (cause) {
      if (!controller.signal.aborted && revision.current === expectedRevision) {
        setError(cause instanceof Error ? cause.message : '本轮发言未完成，请重试。');
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }, [commit]);

  const vote = useCallback((side: 'plaintiff' | 'defendant') => {
    try { commit(castJuryVote(sessionRef.current, side)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '投票未能提交。'); }
  }, [commit]);

  const appeal = useCallback(() => {
    const current = sessionRef.current;
    if (!current.ruling) return false;
    const side = current.ruling.winner === 'plaintiff' ? 'defendant' : 'plaintiff';
    const previous = current.turns.filter(turn => turn.speaker === side).slice(-1)[0];
    const reason = previous
      ? '我仍坚持此前陈述：“' + previous.text.slice(0, 3000) + '”。请求复核一审对证物的采纳及裁决理由。'
      : '我对一审证物的采纳与责任划分有异议，请重新审理。';
    try {
      const next = createAppealSession(current, reason, side);
      cancel();
      commit(next);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '上诉未能开始，原判与记录已保留。');
      return false;
    }
  }, [cancel, commit]);

  return { session, sessionRef, config, busy, error, advance, vote, appeal, startCase, configure, replace, cancel };
}
