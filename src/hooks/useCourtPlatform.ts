import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaseData, CourtRole } from '../types';
import type { GameInvitation, PlatformMode, PublicGame, JuryWinner } from '../types/platform';
import { newActionId, platformClient, publicGamePath } from '../utils/platformClient';

const routeId = () => /^\/games\/([A-Za-z0-9_-]+)\/?$/.exec(window.location.pathname)?.[1];
const message = (cause: unknown) => cause instanceof Error ? cause.message : '庭审服务暂未响应。';
export function useCourtPlatform() {
  const [gameId, setGameId] = useState<string | undefined>(routeId);
  const [game, setGame] = useState<PublicGame>();
  const gameRef = useRef(game);
  const watchedId = useRef(gameId);
  const [games, setGames] = useState<PublicGame[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [invitation, setInvitation] = useState<GameInvitation>();
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
    if (gameRef.current?.id !== id) { setInvitation(undefined); setLocalVote(undefined); setVoteError(undefined); gameRef.current = undefined; setGame(undefined); }
    setGameId(id); setError(undefined);
    window.history.pushState(null, '', publicGamePath(id));
  }, []);
  const leave = useCallback(() => {
    watchedId.current = undefined;
    requestRef.current?.abort(); setGameId(undefined); gameRef.current = undefined; setGame(undefined);
    setInvitation(undefined); setLocalVote(undefined); setError(undefined); setVoteError(undefined);
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
      requestRef.current?.abort();
      watchedId.current = id;
      gameRef.current = undefined; setGame(undefined); setGameId(id); setInvitation(undefined); setLocalVote(undefined);
    };
    window.addEventListener('popstate', pop);
    return () => { disposed.current = true; requestRef.current?.abort(); listRequest.current?.abort(); window.removeEventListener('popstate', pop); };
  }, []);
  useEffect(() => {
    if (!gameId) return;
    let active = true; let timer: number | undefined; let current: AbortController | undefined;
    const poll = async () => {
      current = new AbortController();
      try { const next = await platformClient.get(gameId, current.signal); if (active) { apply(next); setError(undefined); } }
      catch (cause) { if (active && !current.signal.aborted) setError(message(cause)); }
      finally { if (active) timer = window.setTimeout(poll, 1200); }
    };
    void poll();
    return () => { active = false; current?.abort(); window.clearTimeout(timer); };
  }, [gameId, apply]);

  const create = useCallback(async (caseData: CaseData, role: CourtRole, mode: PlatformMode) => {
    if (pendingOperation.current) return false;
    pendingOperation.current = true; setBusy(true); setError(undefined);
    const controller = new AbortController(); requestRef.current = controller;
    const fingerprint = JSON.stringify({ caseData, role, mode });
    if (pendingCreate.current?.fingerprint !== fingerprint) pendingCreate.current = { fingerprint, id: newActionId() };
    try {
      const result = await platformClient.create(caseData, role, mode, pendingCreate.current.id, controller.signal);
      if (disposed.current || controller.signal.aborted) return false;
      owners.current.set(result.game.id, result.ownerToken);
      watch(result.game.id); apply(result.game); setInvitation(result.invitation); pendingCreate.current = undefined;
      return true;
    } catch (cause) { if (!controller.signal.aborted && !disposed.current) setError(message(cause)); return false; }
    finally { pendingOperation.current = false; if (!disposed.current) setBusy(false); }
  }, [apply, watch]);
  const invite = useCallback(async (id: string, role: CourtRole) => {
    if (pendingOperation.current) return false;
    pendingOperation.current = true; setBusy(true); setError(undefined);
    const controller = new AbortController(); requestRef.current = controller;
    try {
      const next = await platformClient.invite(id, role, owners.current.get(id), controller.signal);
      const snapshot = await platformClient.get(id, controller.signal);
      if (disposed.current || controller.signal.aborted) return false;
      watch(id); apply(snapshot); setInvitation(next); return true;
    } catch (cause) { if (!controller.signal.aborted && !disposed.current) setError(message(cause)); return false; }
    finally { pendingOperation.current = false; if (!disposed.current) setBusy(false); }
  }, [apply, watch]);
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
  return { gameId, game, gameRef, games, listLoading, listError, refreshList, watch, leave, error, busy, invitation, create, invite, localVote, voting, voteError, vote };
}
