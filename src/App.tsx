import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CaseData, CourtConnectionConfig, CourtRole, CourtSession } from './types';
import { PRESET_CASES } from './data/presetCases';
import { applyCourtCast, getCourtCast } from './data/courtCasts';
import { Header } from './components/Header';
import { CourtStage } from './components/CourtStage';
import { JuryVoteModal } from './components/JuryVoteModal';
import { VerdictModal } from './components/VerdictModal';
import { AgentHubModal } from './components/AgentHubModal';
import { HistoryArchiveModal } from './components/HistoryArchiveModal';
import { MultiplayerModal } from './components/MultiplayerModal';
import { CastSelectModal } from './components/CastSelectModal';
import { AgentConfigModal } from './components/AgentConfigModal';
import { Modal } from './components/Modal';
import { useCourtSession } from './hooks/useCourtSession';
import { applyExternalCourtRuling, applyExternalCourtTurn, getCourtBalance, submitCourtIntervention } from './utils/courtRuntime';
import { readCaseShareUrl } from './utils/caseShare';
import { getCourtDraft, getCourtStorageError, saveCourtDraft, saveTrialRecord, type TrialRecord } from './utils/historyStorage';
import { multiplayerService, type RoomState } from './utils/multiplayer';
import { connectCourtBridge, type CourtBridgeHandle } from './utils/courtBridge';
import { speech } from './utils/speech';
import { sounds } from './utils/sound';
import { useCourtPlatform } from './hooks/useCourtPlatform';
import { AgentJoinModal } from './components/AgentJoinModal';
import { CourtLobby } from './components/CourtLobby';
import { PlatformJuryModal } from './components/PlatformJuryModal';
import { publicGamePath } from './utils/platformClient';
import type { CreateGameInput, PublicGame } from './types/platform';
import { PlatformHome } from './components/PlatformHome';
import { JudgmentLibrary } from './components/JudgmentLibrary';
import { AgentRelayModal } from './components/AgentRelayModal';
import { PartyCaseModal } from './components/PartyCaseModal';
import { PartyResponse, PartyShareModal } from './components/PartyRoom';
import './platform.css';
import './pixel.css';

type Panel = 'file' | 'share' | 'jury' | 'verdict' | 'agents' | 'history' | 'room' | 'cast' | 'config' | 'join' | 'lobby' | 'library' | 'relay' | null;
const initialCase = applyCourtCast(PRESET_CASES[0], 'everyday');
const platformStatusLabels: Record<PublicGame['status'], string> = {
  'waiting-agents': '等待 Agent 入席',
  'waiting-jurors': 'Agent 已到齐，等陪审团入席。',
  running: '控辩双方正在轮番开火！',
  'waiting-jury': '庭审已封卷，真人陪审团开始投票。',
  'waiting-verdict': '陪审结果已锁定，等待法官当庭宣判。',
  completed: '本案已宣判，完整庭审已归档。',
  unresolved: '陪审投票已结束，本案暂未决出胜方。',
};
export function App() {
  const platform = useCourtPlatform();
  const platformIdentity = useRef<string>();
  const platformActive = useRef(platform.gameId);
  platformActive.current = platform.gameId;
  const court = useCourtSession(initialCase);
  const { session, sessionRef, busy, error, advance, vote, replace, startCase, configure, appeal, cancel } = court;
  const [panel, setPanel] = useState<Panel>(null);
  const [showHome, setShowHome] = useState(true);
  const [filingPreset, setFilingPreset] = useState<CaseData>();
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [replay, setReplay] = useState(false);
  const [replayRevision, setReplayRevision] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [storageError, setStorageError] = useState<string>();
  const [legacyRecord, setLegacyRecord] = useState<TrialRecord>();
  const [room, setRoom] = useState<RoomState>(multiplayerService.getState());
  const [localVote, setLocalVote] = useState<'plaintiff' | 'defendant'>();
  const [remoteVotes, setRemoteVotes] = useState(multiplayerService.getVotes());
  const [bridge, setBridge] = useState<CourtBridgeHandle>();
  const bridgeRef = useRef<CourtBridgeHandle>();
  const [bridgeConnecting, setBridgeConnecting] = useState(false);
  const [bridgeError, setBridgeError] = useState<string>();
  const booted = useRef(false);
  const voteRound = useRef(0);
  const archived = useRef(new Set<string>());
  const modalOpen = panel !== null || !!legacyRecord;
  const inRoom = ['connecting', 'ready', 'connected'].includes(room.status);
  const guest = inRoom && !room.isHost;
  const multiplayer = inRoom && (guest || room.peers.length > 0);
  const tally = {
    plaintiff: remoteVotes.filter(item => item.winner === 'plaintiff').length + (localVote === 'plaintiff' ? 1 : 0),
    defendant: remoteVotes.filter(item => item.winner === 'defendant').length + (localVote === 'defendant' ? 1 : 0),
  };
  const participants = Math.max(room.peers.length + 1, remoteVotes.length + 1);
  const openVote = useCallback(() => { setAutoPlaying(false); setPanel('jury'); }, []);
  const closePanel = useCallback(() => setPanel(null), []);
  const openVerdict = useCallback(() => { setAutoPlaying(false); setPanel('verdict'); }, []);
  const openPanel = useCallback((next: Panel) => { setAutoPlaying(false); setPanel(next); }, []);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    if (platform.gameId) return;
    let restored = false;
    try {
      const shared = readCaseShareUrl();
      if (shared) {
        replace(shared); setReplay(shared.status === 'completed'); setShowHome(false);
        setNotice('已打开完整原案，包含已发生的庭审与证物。');
        restored = true;
      }
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : '案卷链接未能打开。'); }
    if (!restored) {
      if (new URLSearchParams(window.location.search).has('room')) { setPanel('room'); return; }
      const draft = getCourtDraft();
      if (draft && draft.mode !== 'external') { replace(draft); setNotice(current => current || '已恢复上次的庭审进度。'); }
      const problem = getCourtStorageError(); if (problem) setStorageError(problem);
    }
    setHydrated(true);
  }, [replace]);
  useEffect(() => {
    if (!platform.game) return;
    const next = platform.game;
    if (next.party) archived.current.add(next.session.id);
    replace(next.session);
    setHydrated(true);
    if (platformIdentity.current !== next.id) {
      platformIdentity.current = next.id;
      setReplay(false);
      setAutoPlaying(true);
    }
  }, [platform.game, replace]);
  useEffect(() => {
    if (platform.game?.status === 'completed' && panel === 'jury') setPanel(null);
  }, [platform.game?.status, panel]);
  useEffect(() => {
    if (!hydrated) return;
    if (!platform.gameId && session.mode !== 'external' && !saveCourtDraft(session)) setStorageError(getCourtStorageError() || '本机未能保存进度。');
    if (session.status === 'completed' && session.ruling && !archived.current.has(session.id)) {
      const saved = saveTrialRecord({ id: session.id, timestamp: Date.now(), caseData: session.caseData, session, winner: session.ruling.winner, finalScaleBalance: getCourtBalance(session), verdictResult: session.ruling.result, caseNumber: session.caseData.caseNumber });
      if (saved) archived.current.add(session.id); else setStorageError(getCourtStorageError() || '本机未能归档。');
    }
  }, [session, hydrated, platform.gameId]);
  useEffect(() => { setLocalVote(undefined); setRemoteVotes([]); voteRound.current = 0; }, [session.id]);
  useEffect(() => { if (error) setAutoPlaying(false); }, [error]);
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) { setAutoPlaying(false); cancel(); speech.stop(); } };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [cancel]);
  useEffect(() => {
    const unsubscribeStatus = multiplayerService.subscribeStatus(setRoom);
    const unsubscribe = multiplayerService.subscribe(message => {
      if (platformActive.current) return;
      if (message.type === 'SYNC_SESSION' && !multiplayerService.getState().isHost) {
        try { replace(message.payload as CourtSession); setHydrated(true); } catch (cause) { setNotice(cause instanceof Error ? cause.message : '房间案卷无效。'); }
      } else if (message.type === 'CAST_VOTE') {
        setRemoteVotes(multiplayerService.getVotes());
      } else if (message.type === 'VOTE_STATE') {
        const state = message.payload as { sessionId?: string; round?: number };
        if (state.sessionId !== sessionRef.current.id) return;
        if (typeof state.round === 'number' && state.round !== voteRound.current) { voteRound.current = state.round; setLocalVote(undefined); }
        setRemoteVotes(multiplayerService.getVotes());
      }
    });
    return () => { unsubscribe(); unsubscribeStatus(); multiplayerService.disconnect(); };
  }, [replace]);
  useEffect(() => {
    if (!platform.gameId && room.isHost && ['ready', 'connected'].includes(room.status)) multiplayerService.send('SYNC_SESSION', session);
  }, [session, room.isHost, room.status, platform.gameId]);
  useEffect(() => {
    if (bridge && !platform.gameId) void bridge.publish(session).catch(cause => setBridgeError(cause instanceof Error ? cause.message : '同步失败。'));
  }, [bridge, session, platform.gameId]);
  useEffect(() => () => { const handle = bridgeRef.current; if (handle) void handle.disconnect().catch(cause => console.error('Court bridge cleanup failed', cause)); sounds.stopBGM(); speech.stop(); }, []);

  useEffect(() => {
    if (!platform.gameId) return;
    multiplayerService.disconnect();
    const handle = bridgeRef.current;
    if (handle) void handle.disconnect().then(() => {
      if (bridgeRef.current === handle) { bridgeRef.current = undefined; setBridge(undefined); }
    }).catch(cause => setNotice('旧本机桥接关闭失败：' + (cause instanceof Error ? cause.message : String(cause))));
  }, [platform.gameId]);

  const openLocalPanel = (next: 'agents' | 'room' | 'config') => {
    if (platform.gameId) return;
    openPanel(next);
  };
  const chooseCase = (caseData: CaseData) => {
    if (guest) { setNotice('你正在旁听房间，案件由房主同步。'); return; }
    if (platform.gameId) platform.leave();
    setAutoPlaying(false); setReplay(false); setPanel(null); setHydrated(true); setShowHome(false);
    startCase(applyCourtCast(caseData, getCourtCast(sessionRef.current.caseData).id));
  };
  const setCast = (castId: string) => {
    if (guest || platform.gameId || getCourtCast(sessionRef.current.caseData).id === castId) return;
    setAutoPlaying(false); setReplay(false); setPanel(null); setHydrated(true);
    startCase(applyCourtCast(sessionRef.current.caseData, castId));
  };
  const applyConfig = (config?: CourtConnectionConfig) => { if (guest) return; if (platform.gameId) platform.leave(); setAutoPlaying(false); setPanel(null); setReplay(false); configure(config); };
  const castVote = (side: 'plaintiff' | 'defendant') => {
    if (localVote || sessionRef.current.status !== 'awaiting-ruling') return;
    sounds.playVoteClick();
    if (guest) {
      if (multiplayerService.send('CAST_VOTE', { winner: side })) setLocalVote(side);
      else setNotice('投票尚未送达，请确认与房主的连接后重试。');
      return;
    }
    setLocalVote(side);
    if (!multiplayer) { vote(side); setPanel(null); setAutoPlaying(true); }
  };
  const finalizeVotes = () => {
    if (guest || sessionRef.current.status !== 'awaiting-ruling' || tally.plaintiff === tally.defendant) return;
    vote(tally.plaintiff > tally.defendant ? 'plaintiff' : 'defendant');
    setPanel(null); setAutoPlaying(true);
  };
  const restartVotes = () => {
    if (!guest && multiplayerService.restartVote()) { setLocalVote(undefined); setRemoteVotes([]); }
  };
  const connectBridge = async () => {
    if (platformActive.current || bridgeRef.current || bridgeConnecting || guest) return;
    setAutoPlaying(false); cancel(); setBridgeConnecting(true); setBridgeError(undefined);
    try {
      const handle = await connectCourtBridge(sessionRef.current, command => {
        if (platformActive.current) throw new Error('服务端庭审不接受本机桥接命令。');
        const current = sessionRef.current;
        let next: CourtSession;
        if (command.type === 'evidence') next = submitCourtIntervention(current, { kind: 'evidence', text: command.evidence.description, evidence: command.evidence });
        else if (command.type === 'ruling') next = applyExternalCourtRuling(current, { speaker: 'judge', text: command.ruling.result + ' ' + command.ruling.quote, ruling: command.ruling, responseTo: command.responseTo || [], evidenceIds: command.evidenceIds || command.ruling.evidenceIds });
        else next = applyExternalCourtTurn(current, { speaker: command.role, text: command.text, responseTo: command.responseTo || [], evidenceIds: command.evidenceIds || [] });
        replace(next);
      }, cause => setBridgeError(cause.message));
      if (platformActive.current) { await handle.disconnect(); return; }
      bridgeRef.current = handle; setBridge(handle);
    } catch (cause) { setBridgeError(cause instanceof Error ? cause.message : '本机桥接未能启用。'); }
    finally { setBridgeConnecting(false); }
  };
  const disconnectBridge = async () => {
    const handle = bridgeRef.current;
    if (!handle) return;
    try { await handle.disconnect(); bridgeRef.current = undefined; setBridge(undefined); setBridgeError(undefined); }
    catch (cause) { setBridgeError(cause instanceof Error ? cause.message : '桥接未能关闭，请重试。'); }
  };
  const replayRecord = (record: TrialRecord, verdictOnly = false) => {
    if (guest) return;
    if (platform.gameId) platform.leave();
    setPanel(null);
    if (record.session) {
      setShowHome(false);
      replace(record.session); setReplayRevision(value => value + 1); setReplay(!verdictOnly); setAutoPlaying(!verdictOnly);
      if (verdictOnly) setPanel('verdict');
    } else if (verdictOnly) setLegacyRecord(record);
    else { chooseCase(record.caseData); setNotice('这是旧版存档，现已为同一案件开启全新庭审，原案卷仍已保留。'); }
  };
  const viewAppeal = () => {
    if (guest) return;
    if (appeal()) { setPanel(null); setReplay(false); setAutoPlaying(true); }
  };

  useEffect(() => {
    if (platform.gameId || !showHome) return;
    const refresh = () => { if (!document.hidden) void platform.refreshList(); };
    refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [platform.gameId, showHome, platform.refreshList]);
  const goHome = () => {
    setAutoPlaying(false); cancel(); speech.stop();
    if (platform.gameId) platform.leave();
    setShowHome(true); setPanel(null);
  };
  const fileCase = (preset?: CaseData) => {
    setFilingPreset(preset);
    openPanel('file');
  };
  const createPartyGame = async (input: CreateGameInput) => {
    setAutoPlaying(false); cancel(); setReplay(false);
    if (await platform.create(input)) {
      setPanel(input.party?.plaintiff === 'external' ? 'join' : input.party?.defendant === 'friend' ? 'share' : null);
    }
  };
  const inviteRole = async (id: string, role: CourtRole) => {
    if (role === 'judge') return;
    setPanel('join');
    await platform.invite(id, role);
  };
  const respond = async (stance: string, useAgent: boolean) => {
    if (await platform.respond(stance, useAgent) && useAgent) setPanel('join');
  };
  const watchGame = (id: string, participate = false) => {
    cancel(); setPanel(null); setReplay(false); setAutoPlaying(true); platform.watch(id);
    if (participate) void platform.joinJury(id);
  };
  const openLobby = () => { openPanel('lobby'); void platform.refreshList(); };
  const castPlatformVote = async (side: 'plaintiff' | 'defendant') => {
    if (await platform.vote(side)) setPanel(null);
  };

  const game = platform.game;
  const party = game?.party;
  const stageSession = game?.session || session;
  const seated = !!platform.juror?.seated && platform.juror.id === game?.id;
  const waitingForFriend = party?.defendant === 'friend' && game?.audience?.seated === 1 && game.status === 'waiting-jurors';
  const participant = !!platform.juror?.participant;
  const shouldRespond = !!(waitingForFriend && platform.responseTicket && !participant);
  const ownPartyInvitation = platform.ownInvitations.plaintiff || platform.ownInvitations.defendant;
  const invitation = party ? ownPartyInvitation : platform.invitation?.role === 'judge' ? undefined : platform.invitation;
  const partyLinks = platform.partyLinks;
  const defenseLink = waitingForFriend ? partyLinks?.defense : undefined;
  const gameTitle = party ? (party.defendant === 'friend' ? '双人庭审' : '单人庭审') : game?.mode === 'practice' ? '我的 Agent + 系统陪练' : '公开庭审';
  const gameStatus = game?.status === 'waiting-jury' && game.jury.outcome !== 'pending' ? 'waiting-verdict' : game?.status;
  let statusText = gameStatus ? platformStatusLabels[gameStatus] : '';
  if (party && game) {
    if (waitingForFriend) statusText = '等朋友应诉。';
    else if (gameStatus === 'waiting-agents') statusText = game.seats.plaintiff.status === 'reserved' ? '等原告的辩护人到场。' : '等被告的辩护人到场。';
    else if (gameStatus === 'waiting-jury') statusText = party.visibility === 'public' ? '庭审结束，陪审团开始投票。' : '庭审结束，等当事人投票。';
  }

  return <div className="court-app">
    <Header onHome={goHome} onOpenLibrary={() => openPanel('library')} onFileCase={() => fileCase()} onOpenLobby={openLobby}
      onOpenAgentHub={() => openLocalPanel('agents')} onOpenHistory={() => openPanel('history')} onOpenMultiplayer={() => openLocalPanel('room')}
      onOpenCast={() => openPanel('cast')} onOpenConfig={() => openLocalPanel('config')} localTools={!showHome && !platform.gameId} />
    <main className="court-main">
      {!platform.gameId && showHome && <PlatformHome games={platform.games} loading={platform.listLoading} error={platform.listError} onRefresh={() => { void platform.refreshList(); }} onCreate={fileCase} onWatch={watchGame} onJoin={(id, role) => { void inviteRole(id, role); }} onLibrary={() => openPanel('library')} />}
      {game && !shouldRespond && <div className="platform-game-strip">
        <div><strong>{gameTitle}{party && (party.visibility === 'invite' ? ' · 仅持链接的人可旁听' : ' · 公开旁听')}</strong><span role="status">{statusText}</span></div>
        <span className={'platform-connection platform-connection--' + platform.connection} role="status">{platform.connection === 'live' ? '● 实时同步' : platform.connection === 'polling' ? '● 定时同步' : platform.connection === 'idle' ? '✓ 记录已同步' : '○ 正在连接'}</span>
        {party ? <>
          {partyLinks && <button className={defenseLink ? 'court-button court-button--primary' : 'court-button'} onClick={() => openPanel('share')}>{defenseLink ? '邀请朋友应诉' : '分享庭审'}</button>}
          {ownPartyInvitation && <button className="court-button" onClick={() => openPanel('join')}>我的出庭邀请</button>}
        </> : <>
          <a href={publicGamePath(game.id)}>本案固定链接</a>
          <button className="court-button" onClick={() => openPanel('join')}>席位与邀请</button>
        </>}
      </div>}
      {game && shouldRespond && <PartyResponse key={game.id} game={game} busy={platform.responseBusy} error={platform.responseError} roomUrl={partyLinks?.room} onRespond={respond} />}
      {platform.gameId && !platform.game && <p className="court-notice" role="status">{platform.error || '正在打开庭审…'}<button onClick={goHome}>返回大厅</button></p>}
      {platform.error && platform.game && panel !== 'join' && panel !== 'file' && <p className="court-runtime-error" role="alert">{platform.error}</p>}
      {(notice || storageError) && <div className="court-notice" role="status"><span>{storageError || notice}</span><button onClick={() => { setNotice(undefined); setStorageError(undefined); }} aria-label="关闭提示">×</button></div>}
      {inRoom && <div className="court-room-status"><span className="speaking-dot" />陪审房间 {room.roomId} · {room.isHost ? '你是房主陪审员' : '你是旁听陪审员'} · {room.status === 'connecting' ? '连接中' : room.isHost ? room.peers.length + ' 位朋友已加入' : '已同步房主庭审'}<button onClick={() => openPanel('room')}>房间详情</button></div>}
      {((!platform.gameId && !showHome) || (game && !shouldRespond)) && <CourtStage key={stageSession.id + ':' + replayRevision} session={stageSession} busy={!game && busy} error={game ? undefined : error} autoPlaying={autoPlaying && !modalOpen} onAutoPlayingChange={setAutoPlaying} onAdvance={advance} onOpenVote={openVote} onOpenCast={() => openPanel('cast')} onOpenAgents={() => openLocalPanel('config')} onOpenVerdict={openVerdict} guest={!game && guest} replay={replay} platformGame={game} onJoinRole={game && !party ? role => { void inviteRole(game.id, role); } : undefined}
        juror={game?.audience ? { seated, participant, busy: !!platform.juror?.busy, error: platform.juror?.error, join: party?.visibility === 'invite' ? undefined : () => { void platform.joinJury(game.id); }, react: platform.juryAction } : undefined} />}
    </main>
    {panel === 'file' && <PartyCaseModal preset={filingPreset} busy={platform.busy} error={platform.error} onClose={() => { if (!platform.busy) closePanel(); }} onSubmit={createPartyGame} />}
    {panel === 'share' && party && partyLinks && <PartyShareModal visibility={party.visibility} links={{ room: partyLinks.room, defense: defenseLink }} onClose={closePanel} />}
    <CastSelectModal isOpen={panel === 'cast'} onClose={closePanel} currentCastId={getCourtCast(session.caseData).id} onSelect={setCast} hasProgress={session.turns.length > 0} readOnly={!!platform.gameId} />
    <AgentConfigModal isOpen={panel === 'config'} onClose={closePanel} currentConfig={court.config} currentMode={session.mode} hasProgress={session.turns.length > 0} onApply={applyConfig} />
    <JuryVoteModal isOpen={!platform.game && panel === 'jury' && session.status === 'awaiting-ruling'} onClose={closePanel} currentCase={session.caseData} localVote={localVote} tally={tally} participants={participants} guest={guest} multiplayer={multiplayer} onVote={castVote} onFinalize={finalizeVotes} onRestartVote={restartVotes} />
    <VerdictModal isOpen={panel === 'verdict'} onClose={closePanel} session={stageSession} onStartAppeal={game ? undefined : viewAppeal} shareUrl={party ? partyLinks?.room ?? null : game ? new URL(publicGamePath(game.id), window.location.origin).href : undefined} juryOutcome={game?.jury.outcome} onPlayAgain={() => fileCase()} />
    <AgentHubModal isOpen={panel === 'agents'} onClose={closePanel} session={session} connection={bridge?.connection} connecting={bridgeConnecting} error={bridgeError} onConnect={() => { void connectBridge(); }} onDisconnect={() => { void disconnectBridge(); }} />
    <HistoryArchiveModal isOpen={panel === 'history'} onClose={closePanel} onReplayTrial={record => replayRecord(record)} onViewHistoricalVerdict={record => replayRecord(record, true)} />
    <MultiplayerModal isOpen={panel === 'room'} onClose={closePanel} currentCase={session.caseData} session={session} onMultiplayerConnected={() => { setAutoPlaying(false); cancel(); if (multiplayerService.getState().isHost) setHydrated(true); }} />
    <AgentJoinModal isOpen={panel === 'join'} onClose={closePanel} game={game} invitation={invitation} ownInvitations={platform.ownInvitations} busy={platform.busy} error={platform.error} onInvite={role => { if (game && !party) void inviteRole(game.id, role); }} onRelay={() => setPanel('relay')} />
    <Modal isOpen={panel === 'lobby'} onClose={closePanel} title="旁听大厅" className="court-lobby-modal"><CourtLobby games={platform.games} loading={platform.listLoading} error={platform.listError} onWatch={watchGame} onJoin={(id, role) => { void inviteRole(id, role); }} onRefresh={() => { void platform.refreshList(); }} /></Modal>
    <JudgmentLibrary isOpen={panel === 'library'} onClose={closePanel} onWatch={watchGame} />
    {game && invitation && <AgentRelayModal isOpen={panel === 'relay'} onClose={() => setPanel('join')} game={game} invitation={invitation} onAccepted={platform.applyGame} />}
    {game && <PlatformJuryModal isOpen={panel === 'jury'} onClose={closePanel} game={game} localVote={platform.localVote} voting={platform.voting} error={platform.voteError} onVote={side => { void castPlatformVote(side); }} seated={game.audience || party ? seated : undefined} />}
    <Modal isOpen={!!legacyRecord} onClose={() => setLegacyRecord(undefined)} title="旧版判决存档"><div className="legacy-record"><p>此记录来自早期案卷，未记录完整发言轨迹。</p><h3>{legacyRecord?.caseData.title}</h3><p>{legacyRecord?.verdictResult}</p></div></Modal>
  </div>;
}
export default App;
