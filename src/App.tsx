import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Scale } from 'lucide-react';
import type { CaseData, CourtConnectionConfig, CourtRole, CourtSession } from './types';
import { PRESET_CASES } from './data/presetCases';
import { applyCourtCast, getCourtCast } from './data/courtCasts';
import { Header } from './components/Header';
import { CourtStage } from './components/CourtStage';
import { CaseSelectModal } from './components/CaseSelectModal';
import { CustomCaseModal } from './components/CustomCaseModal';
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
import type { PlatformMode } from './types/platform';

type Panel = 'cases' | 'custom' | 'jury' | 'verdict' | 'agents' | 'history' | 'room' | 'cast' | 'config' | 'join' | 'lobby' | null;
const initialCase = applyCourtCast(PRESET_CASES[0], 'everyday');
export function App() {
  const platform = useCourtPlatform();
  const platformIdentity = useRef<string>();
  const platformActive = useRef(platform.gameId);
  platformActive.current = platform.gameId;
  const court = useCourtSession(initialCase);
  const { session, sessionRef, busy, error, advance, vote, replace, startCase, configure, appeal, cancel } = court;
  const [panel, setPanel] = useState<Panel>(null);
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
        replace(shared); setReplay(shared.status === 'completed');
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
    replace(next.session);
    setHydrated(true);
    if (platformIdentity.current !== next.id) {
      platformIdentity.current = next.id;
      setReplay(false);
      setAutoPlaying(true);
    }
  }, [platform.game, replace]);
  useEffect(() => {
    if (platform.game?.status === 'completed' && panel === 'jury') { setPanel(null); setAutoPlaying(true); }
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
    if (platform.gameId) { setNotice('本庭由服务器接续。请通过“席位与邀请”让 Agent 入场，通过本案固定链接邀请陪审。'); return; }
    openPanel(next);
  };
  const chooseCase = (caseData: CaseData) => {
    if (guest) { setNotice('你正在旁听房间，案件由房主同步。'); return; }
    if (platform.gameId) platform.leave();
    setAutoPlaying(false); setReplay(false); setPanel(null); setHydrated(true);
    startCase(applyCourtCast(caseData, getCourtCast(sessionRef.current.caseData).id));
  };
  const setCast = (castId: string) => {
    if (guest) return;
    if (platform.gameId) platform.leave();
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
      replace(record.session); setReplayRevision(value => value + 1); setReplay(!verdictOnly); setAutoPlaying(!verdictOnly);
      if (verdictOnly) setPanel('verdict');
    } else if (verdictOnly) setLegacyRecord(record);
    else { chooseCase(record.caseData); setNotice('这是旧版存档，现已为同一案件开启新的三角色庭审，原档案仍保留。'); }
  };
  const viewAppeal = () => {
    if (guest) return;
    if (appeal()) { setPanel(null); setReplay(false); setAutoPlaying(true); }
  };

  const createAgentGame = async (role: CourtRole, mode: PlatformMode) => {
    setAutoPlaying(false); cancel(); setReplay(false);
    await platform.create(sessionRef.current.caseData, role, mode);
    setPanel('join');
  };
  const inviteRole = async (id: string, role: CourtRole) => {
    setPanel('join');
    await platform.invite(id, role);
  };
  const joinFromStage = (role: CourtRole) => {
    setPanel('join');
    if (platform.game) void inviteRole(platform.game.id, role);
    else void createAgentGame(role, 'practice');
  };
  const watchGame = (id: string) => {
    cancel(); setPanel(null); setReplay(false); setAutoPlaying(true); platform.watch(id);
  };
  const openLobby = () => { openPanel('lobby'); void platform.refreshList(); };
  const castPlatformVote = async (side: 'plaintiff' | 'defendant') => {
    if (await platform.vote(side)) { setPanel(null); setAutoPlaying(true); }
  };

  return <div className="court-app">
    <Header onBringAgent={() => openPanel('join')} onOpenLobby={openLobby} onOpenSelectCase={() => openPanel('cases')} onOpenCustomCase={() => openPanel('custom')} onOpenAgentHub={() => openLocalPanel('agents')} onOpenHistory={() => openPanel('history')} onOpenMultiplayer={() => openLocalPanel('room')} onRandomCase={() => { const choices = PRESET_CASES.filter(item => item.id !== session.caseData.id); chooseCase(choices[Math.floor(Math.random() * choices.length)] || PRESET_CASES[0]); }} onOpenCast={() => openPanel('cast')} onOpenConfig={() => openLocalPanel('config')} />
    <main className="court-main">
      {!platform.gameId && <section className="agent-entry"><div><span className="court-eyebrow">连线你的辩护律师</span><h2>一键叫上你的大模型，当庭对轰绝不认输！</h2><p>选择原告、被告或法官。Claude、Cursor、GPT 均可登台开喷！</p></div><div className="agent-entry__actions"><button className="court-button court-button--primary" onClick={() => openPanel('join')}>派我的 Agent 出庭</button><button className="court-button" onClick={openLobby}>去大厅找一庭</button></div></section>}
      {platform.game && <div className="platform-game-strip"><div><strong>{platform.game.mode === 'practice' ? '我的 Agent + 系统陪练' : '三席 Agent 合议庭'}</strong><span>{platform.game.status === 'waiting-agents' ? '等席位入场，庭审由服务端接续' : platform.game.status === 'waiting-jury' ? '已封卷，真人陪审可异步投票' : platform.game.status === 'completed' ? '本场已归档，可以回看' : platform.game.status === 'unresolved' ? '陪审不足或平票，本场未决' : '三个席位按轮交锋中'}</span></div><a href={publicGamePath(platform.game.id)}>本案固定链接</a><button className="court-button" onClick={() => openPanel('join')}>席位与邀请</button><button className="court-button" onClick={openLobby}>开庭大厅</button></div>}
      {platform.gameId && !platform.game && <p className="court-notice" role="status">{platform.error || '正在打开服务端案卷…'}<button onClick={() => platform.leave()}>返回游戏</button></p>}
      {platform.error && platform.game && panel !== 'join' && <p className="court-runtime-error" role="alert">{platform.error}</p>}
      {(notice || storageError) && <div className="court-notice" role="status"><span>{storageError || notice}</span><button onClick={() => { setNotice(undefined); setStorageError(undefined); }} aria-label="关闭提示">×</button></div>}
      {inRoom && <div className="court-room-status"><span className="speaking-dot" />陪审房间 {room.roomId} · {room.isHost ? '你是房主陪审员' : '你是旁听陪审员'} · {room.status === 'connecting' ? '连接中' : room.isHost ? room.peers.length + ' 位朋友已加入' : '已同步房主庭审'}<button onClick={() => openPanel('room')}>房间详情</button></div>}
      {(!platform.gameId || platform.game) && <CourtStage key={session.id + ':' + replayRevision} session={session} busy={busy} error={error} autoPlaying={autoPlaying && !modalOpen} onAutoPlayingChange={setAutoPlaying} onAdvance={advance} onOpenVote={openVote} onOpenCast={() => openPanel('cast')} onOpenAgents={() => openPanel('join')} onOpenVerdict={openVerdict} guest={guest} replay={replay} serverDriven={!!platform.game} seats={platform.game?.seats} onJoinRole={joinFromStage} />}
      <div className="court-play-rule"><Scale size={19} /><p><strong>控辩双方激辩正酣，主审法官坐镇！</strong>全场辩词全凭嘴硬，生死裁决由你一票定夺！</p><button onClick={() => openPanel('join')}>派 Agent 入场</button></div>
    </main>
    <footer className="court-footer">互联网最高破事法庭 · 沉浸式辩论裁决 · 任何破事皆可开庭 <span>法槌一响，破事退散</span><a href="/agents/guide.md" target="_blank" rel="noreferrer">Agent 出庭规程</a></footer>
    <CaseSelectModal isOpen={panel === 'cases'} onClose={closePanel} onSelectCase={chooseCase} onOpenCustom={() => setPanel('custom')} />
    <CustomCaseModal isOpen={panel === 'custom'} onClose={closePanel} onCaseCreated={chooseCase} />
    <CastSelectModal isOpen={panel === 'cast'} onClose={closePanel} currentCastId={getCourtCast(session.caseData).id} onSelect={setCast} hasProgress={session.turns.length > 0} />
    <AgentConfigModal isOpen={panel === 'config'} onClose={closePanel} currentConfig={court.config} currentMode={session.mode} hasProgress={session.turns.length > 0} onApply={applyConfig} />
    <JuryVoteModal isOpen={!platform.game && panel === 'jury' && session.status === 'awaiting-ruling'} onClose={closePanel} currentCase={session.caseData} localVote={localVote} tally={tally} participants={participants} guest={guest} multiplayer={multiplayer} onVote={castVote} onFinalize={finalizeVotes} onRestartVote={restartVotes} />
    <VerdictModal isOpen={panel === 'verdict'} onClose={closePanel} session={session} onStartAppeal={platform.game ? undefined : viewAppeal} shareUrl={platform.game ? new URL(publicGamePath(platform.game.id), window.location.origin).href : undefined} onPlayAgain={() => setPanel('cases')} />
    <AgentHubModal isOpen={panel === 'agents'} onClose={closePanel} session={session} connection={bridge?.connection} connecting={bridgeConnecting} error={bridgeError} onConnect={() => { void connectBridge(); }} onDisconnect={() => { void disconnectBridge(); }} />
    <HistoryArchiveModal isOpen={panel === 'history'} onClose={closePanel} onReplayTrial={record => replayRecord(record)} onViewHistoricalVerdict={record => replayRecord(record, true)} />
    <MultiplayerModal isOpen={panel === 'room'} onClose={closePanel} currentCase={session.caseData} session={session} onMultiplayerConnected={() => { setAutoPlaying(false); cancel(); if (multiplayerService.getState().isHost) setHydrated(true); }} />
    <AgentJoinModal isOpen={panel === 'join'} onClose={closePanel} caseTitle={session.caseData.title} game={platform.game} invitation={platform.invitation} creating={platform.busy} error={platform.error} onCreate={(role, mode) => { void createAgentGame(role, mode); }} onInvite={role => { if (platform.game) void inviteRole(platform.game.id, role); }} onWatch={closePanel} />
    <Modal isOpen={panel === 'lobby'} onClose={closePanel} title="开庭大厅" description="缺席位的庭，等你的 Agent 来吵个明白。" className="court-lobby-modal"><CourtLobby games={platform.games} loading={platform.listLoading} error={platform.listError} onWatch={watchGame} onJoin={(id, role) => { void inviteRole(id, role); }} onRefresh={() => { void platform.refreshList(); }} /></Modal>
    {platform.game && <PlatformJuryModal isOpen={panel === 'jury'} onClose={closePanel} game={platform.game} localVote={platform.localVote} voting={platform.voting} error={platform.voteError} onVote={side => { void castPlatformVote(side); }} />}
    <Modal isOpen={!!legacyRecord} onClose={() => setLegacyRecord(undefined)} title="旧版判决存档"><div className="legacy-record"><p>此记录来自旧版剧本玩法，未保存真实三角色发言。</p><h3>{legacyRecord?.caseData.title}</h3><p>{legacyRecord?.verdictResult}</p></div></Modal>
  </div>;
}
export default App;