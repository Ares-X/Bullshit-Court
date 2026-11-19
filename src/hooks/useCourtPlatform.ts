import { useCallback, useEffect, useRef, useState } from 'react';
import type { CourtRole } from '../types';
import type { CreateGameInput, GameCard, GameInvitation, PublicGame, JuryWinner } from '../types/platform';
import { newActionId, platformClient, publicGamePath } from '../utils/platformClient';

const routeId = () => /^\/games\/([A-Za-z0-9_-]+)\/?$/.exec(window.location.pathname)?.[1];
type LocalInvitations = Partial<Record<CourtRole, GameInvitation>>;
const invitationKey = (id: string) => 'internet-court:invitation:' + id;
const invitationsKey = (id: string) => 'internet-court:invitations:' + id;
const validInvitation = (value: unknown): value is GameInvitation => {
  if (!value || typeof value !== 'object') return false;
  const item = value as GameInvitation;
  // Worker tickets carry a "gameId.secret" prefix; legacy Node tickets are a single blob.
  return typeof item.ticket === 'string' && /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)?$/.test(item.ticket) && ['judge', 'plaintiff', 'defendant'].includes(item.role) && item.path === '/join/' + item.ticket;
};
const restoreInvitations = (id: string): LocalInvitations => {
  const invitations: LocalInvitations = {};
  try {
    const saved = JSON.parse(sessionStorage.getItem(invitationsKey(id)) || '{}') as LocalInvitations;
    for (const role of ['judge', 'plaintiff', 'defendant'] as const) {
      if (validInvitation(saved?.[role]) && saved[role]?.role === role) invitations[role] = saved[role];
    }
  } catch { /* A malformed cache must not prevent browsing. */ }
  try {
    const legacy: unknown = JSON.parse(sessionStorage.getItem(invitationKey(id)) || 'null');
    if (validInvitation(legacy) && !invitations[legacy.role]) invitations[legacy.role] = legacy;
  } catch { /* Private browser storage can be unavailable. */ }
  return invitations;
};
const restoreInvitation = (id: string): GameInvitation | undefined => {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(invitationKey(id)) || 'null');
    if (validInvitation(value)) return value;
  } catch { /* Fall back to any retained seat invitation. */ }
  return Object.values(restoreInvitations(id))[0];
};
const message = (cause: unknown) => cause instanceof Error ? cause.message : '庭审服务暂未响应。';
export function useCourtPlatform() {
  const [gameId, setGameId] = useState<string | undefined>(routeId);
  const [game, setGame] = useState<PublicGame>();
  const gameRef = useRef(game);
  const watchedId = useRef(gameId);
  const [games, setGames] = useState<GameCard[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<'idle' | 'connecting' | 'live' | 'polling'>('idle');
  const [invitation, setInvitation] = useState<GameInvitation | undefined>(() => gameId ? restoreInvitation(gameId) : undefined);
  const [ownInvitations, setOwnInvitations] = useState<LocalInvitations>(() => gameId ? restoreInvitations(gameId) : {});
  const invitationCache = useRef(new Map<string, LocalInvitations>());
  if (gameId && !invitationCache.current.has(gameId)) invitationCache.current.set(gameId, ownInvitations);
  const savedInvitations = useCallback((id: string) => {
    let retained = invitationCache.current.get(id);
    if (!retained) { retained = restoreInvitations(id); invitationCache.current.set(id, retained); }
    return retained;
  }, []);
  const rememberInvitation = useCallback((id: string, next: GameInvitation) => {
    const retained = { ...savedInvitations(id), [next.role]: next };
    invitationCache.current.set(id, retained);
    try {
      sessionStorage.setItem(invitationsKey(id), JSON.stringify(retained));
      sessionStorage.setItem(invitationKey(id), JSON.stringify(next));
    } catch { /* All invitations remain available in this page's private memory. */ }
    if (watchedId.current === id) { setOwnInvitations(retained); setInvitation(next); }
  }, [savedInvitations]);
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string>();
  const [localVote, setLocalVote] = useState<JuryWinner>();
  const owners = useRef(new Map<string, string>());
  const requestRef = useRef<AbortController>();
  const listRequest = useRef<AbortController>();
  const pendingCreate = useRef<{ fingerprint: string; id: string }>();
  const pendingVote = useRef<{ gameId: string; side: JuryWinner; id: string }>();
  const pendingOperation = useRef(false);
  const disposed = useRef(false);
  const apply = useCallback((next: PublicGame) => {
    if (disposed.current || watchedId.current !== next.id) return;
    if (gameRef.current?.id === next.id && gameRef.current.revision >= next.revision) return;
    gameRef.current = next; setGame(next);
  }, []);
  const watch = useCallback((id: string) => {
    if (watchedId.current !== id) requestRef.current?.abort();
    watchedId.current = id;
    if (gameRef.current?.id !== id) { const retained = savedInvitations(id); setOwnInvitations(retained); setInvitation(restoreInvitation(id) || Object.values(retained)[0]); setLocalVote(undefined); setVoteError(undefined); gameRef.current = undefined; setGame(undefined); }
    setGameId(id); setError(undefined);
    if (window.location.pathname !== publicGamePath(id)) window.history.pushState(null, '', publicGamePath(id));
  }, [savedInvitations]);
  const leave = useCallback(() => {
    watchedId.current = undefined;
    requestRef.current?.abort(); setGameId(undefined); gameRef.current = undefined; setGame(undefined);
    setInvitation(undefined); setOwnInvitations({}); setLocalVote(undefined); setError(undefined); setVoteError(undefined);
    window.history.pushState(null, '', '/');
  }, []);
  const refreshList = useCallback(async () => {
    listRequest.current?.abort(); const controller = new AbortController(); listRequest.current = controller;
    setListLoading(true); setListError(undefined);
    try { const result = await platformClient.list(controller.signal); if (!controller.signal.aborted && !disposed.current) setGames(result.games); }
    catch (cause) { if (!controller.signal.aborted && !disposed.current) setListError(message(cause)); }
    finally { if (!controller.signal.aborted && !disposed.current) setListLoading(false); }
  }, []);

  useEffect(() => {
    disposed.current = false;
    const pop = () => {
      const id = routeId();
      if (id === watchedId.current) return;
      requestRef.current?.abort();
      watchedId.current = id;
      const retained = id ? savedInvitations(id) : {};
      gameRef.current = undefined; setGame(undefined); setGameId(id); setOwnInvitations(retained); setInvitation(id ? restoreInvitation(id) || Object.values(retained)[0] : undefined); setLocalVote(undefined); setVoteError(undefined); setError(undefined);
    };
    window.addEventListener('popstate', pop);
    return () => { disposed.current = true; requestRef.current?.abort(); listRequest.current?.abort(); window.removeEventListener('popstate', pop); };
  }, [savedInvitations]);
  useEffect(() => {
    if (!gameId) { setConnection('idle'); return; }
    let active = true; let timer: number | undefined; let current: AbortController | undefined;
    let source: EventSource | undefined; let polling = false;
    const terminal = (snapshot: PublicGame) => snapshot.status === 'completed' || snapshot.status === 'unresolved';
    const receive = (snapshot: PublicGame) => {
      if (!active || snapshot.id !== gameId) return;
      apply(snapshot); setError(undefined);
      if (terminal(snapshot)) { source?.close(); window.clearTimeout(timer); setConnection('idle'); }
    };
    const poll = async () => {
      if (!active) return;
      const controller = new AbortController(); current = controller; let finished = false;
      try { const next = await platformClient.get(gameId, controller.signal); if (active) { receive(next); finished = terminal(next); } }
      catch (cause) { if (active && polling && !controller.signal.aborted) setError(message(cause)); }
      finally { if (active && polling && !finished && current === controller) timer = window.setTimeout(poll, 2500); }
    };
    const fallback = () => {
      if (!active || polling) return;
      source?.close(); polling = true; setConnection('polling');
      current?.abort(); void poll();
    };
    setConnection('connecting');
    if (typeof EventSource === 'undefined') fallback();
    else {
      // One push stream for the selected game. The fallback starts only when it fails.
      try {
        const after = gameRef.current?.id === gameId ? gameRef.current.revision : 0;
        source = new EventSource('/api/games/' + encodeURIComponent(gameId) + '/events?after=' + after);
        source.onopen = () => { if (active) { setConnection('live'); setError(undefined); } };
        source.addEventListener('game', event => {
          if (!active) return;
          try {
            const snapshot = JSON.parse((event as MessageEvent<string>).data) as PublicGame;
            if (snapshot.id !== gameId || !Number.isInteger(snapshot.revision) || !snapshot.session) throw new Error('invalid snapshot');
            receive(snapshot);
          } catch { fallback(); }
        });
        source.onerror = fallback;
        // An initial bounded read also handles a proxy that delays the first SSE event.
        void poll();
      } catch { fallback(); }
    }
    return () => { active = false; source?.close(); current?.abort(); window.clearTimeout(timer); };
  }, [gameId, apply]);

  const create = useCallback(async (input: Omit<CreateGameInput, 'clientActionId'>) => {
    if (pendingOperation.current) return false;
    pendingOperation.current = true; setBusy(true); setError(undefined);
    const controller = new AbortController(); requestRef.current = controller;
    const fingerprint = JSON.stringify(input);
    if (pendingCreate.current?.fingerprint !== fingerprint) pendingCreate.current = { fingerprint, id: newActionId() };
    try {
      const result = await platformClient.create({ ...input, clientActionId: pendingCreate.current.id }, controller.signal);
      if (disposed.current || controller.signal.aborted) return false;
      owners.current.set(result.game.id, result.ownerToken);
      watch(result.game.id); apply(result.game); rememberInvitation(result.game.id, result.invitation); pendingCreate.current = undefined;
      return true;
    } catch (cause) { if (!controller.signal.aborted && !disposed.current) setError(message(cause)); return false; }
    finally { pendingOperation.current = false; if (!disposed.current) setBusy(false); }
  }, [apply, watch, rememberInvitation]);
  const invite = useCallback(async (id: string, role: CourtRole) => {
    if (pendingOperation.current) return false;
    pendingOperation.current = true; setBusy(true); setError(undefined);
    const controller = new AbortController(); requestRef.current = controller;
    try {
      const next = savedInvitations(id)[role] || await platformClient.invite(id, role, owners.current.get(id), controller.signal);
      const snapshot = await platformClient.get(id, controller.signal);
      if (disposed.current || controller.signal.aborted) return false;
      watch(id); apply(snapshot); rememberInvitation(id, next); return true;
    } catch (cause) { if (!controller.signal.aborted && !disposed.current) setError(message(cause)); return false; }
    finally { pendingOperation.current = false; if (!disposed.current) setBusy(false); }
  }, [apply, watch, savedInvitations, rememberInvitation]);
  const vote = useCallback(async (side: JuryWinner) => {
    const id = gameRef.current?.id;
    if (!id || voting || localVote) return false;
    setVoting(true); setVoteError(undefined);
    const controller = new AbortController(); requestRef.current = controller;
    if (pendingVote.current?.gameId !== id || pendingVote.current.side !== side) pendingVote.current = { gameId: id, side, id: newActionId() };
    try {
      const visitor = await platformClient.visitor(controller.signal);
      const snapshot = await platformClient.vote(id, side, visitor.csrfToken, pendingVote.current.id, controller.signal);
      if (disposed.current || controller.signal.aborted || watchedId.current !== id) return false;
      setLocalVote(side); apply(snapshot); pendingVote.current = undefined; return true;
    } catch (cause) { if (!controller.signal.aborted && !disposed.current && watchedId.current === id) setVoteError(message(cause)); return false; }
    finally { if (!disposed.current) setVoting(false); }
  }, [apply, voting, localVote]);
  return { gameId, game, gameRef, applyGame: apply, connection, games, listLoading, listError, refreshList, watch, leave, error, busy, invitation, ownInvitations, create, invite, localVote, voting, voteError, vote };
}
