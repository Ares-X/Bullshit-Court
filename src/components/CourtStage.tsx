import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Armchair, ArrowLeft, ArrowRight, BookOpen, Check, Gavel, LoaderCircle, Pause, Play, RotateCcw, Scale, Volume2, VolumeX, Vote } from 'lucide-react';
import type { CourtRole, CourtSession, CourtTurn, ShoutType } from '../types';
import type { JuryProp, JuryReaction, JuryReactionInput, PublicGame } from '../types/platform';
import { getCourtBalance, getCourtRoleProfile, getNextCourtRole } from '../utils/courtRuntime';
import { getCourtCast, getCourtExpression } from '../data/courtCasts';
import { speech } from '../utils/speech';
import { sounds } from '../utils/sound';
import { CharacterPortrait } from './CharacterPortrait';
import { EvidenceLockerModal } from './EvidenceLockerModal';

interface CourtStageProps {
  session: CourtSession; busy: boolean; error?: string; autoPlaying: boolean;
  onAutoPlayingChange: (playing: boolean) => void; onAdvance: () => void;
  onOpenVote: () => void; onOpenCast: () => void; onOpenAgents: () => void;
  onOpenVerdict: () => void; guest?: boolean; replay?: boolean;
  platformGame?: PublicGame; onJoinRole?: (role: CourtRole) => void;
  juror?: { seated: boolean; participant: boolean; busy: boolean; error?: string; join?: () => void; react: (reaction: JuryReactionInput) => Promise<boolean> };
}
const PHASE_LABELS = { opening: '开庭', statements: '双方陈述', inquiry: '法官追问', evidence: '当庭举证', deliberation: '陪审表决', verdict: '法官宣判' };
const ROLE_LABELS: Record<CourtRole, string> = { plaintiff: '原告', judge: '法官', defendant: '被告' };
const ORDER: CourtRole[] = ['plaintiff', 'judge', 'defendant'];
const PROPS: Record<JuryProp, { icon: string; label: string; reaction: string; sound: () => void }> = {
  tomato: { icon: '🍅', label: '扔番茄', reaction: '番茄糊脸！', sound: () => sounds.playDeskSlam() },
  flipflop: { icon: '🩴', label: '甩拖鞋', reaction: '飞来一只拖鞋！', sound: () => sounds.playFlipFlop() },
  egg: { icon: '🥚', label: '扔臭蛋', reaction: '臭蛋开花！', sound: () => sounds.playDeskSlam() },
  popcorn: { icon: '🍿', label: '嚼爆米花', reaction: '前排吃瓜！', sound: () => sounds.playPopcorn() },
  flower: { icon: '💐', label: '献鲜花', reaction: '收到鲜花！', sound: () => sounds.playEvidence() },
};
const PROP_NAMES = Object.keys(PROPS) as JuryProp[];
const SHOUTS: Record<ShoutType, { label: string; sound: () => void }> = {
  OBJECTION: { label: '异议！', sound: () => sounds.playDeskSlam() },
  HOLD_IT: { label: '等等！', sound: () => sounds.playDeskSlam() },
  TAKE_THAT: { label: '看招！', sound: () => sounds.playTakeThat() },
  ORDER: { label: '全体肃静！', sound: () => sounds.playGavel() },
};
const DANMAKU_LIMIT = 60;

export const CourtStage: React.FC<CourtStageProps> = ({ session, busy, error, autoPlaying, onAutoPlayingChange, onAdvance, onOpenVote, onOpenCast, onOpenAgents, onOpenVerdict, guest = false, replay = false, platformGame, onJoinRole, juror }) => {
  const serverDriven = !!platformGame;
  const seats = platformGame?.seats;
  const publicStatus = platformGame?.status;
  const juryWinner = platformGame?.jury.outcome;
  const audience = platformGame?.audience;
  const party = platformGame?.party;
  const canVote = party || audience ? !!juror?.seated : true;
  const publicParty = party?.visibility === 'public';
  const seatingOpen = audience?.canJoin ?? (publicStatus === 'waiting-agents' || publicStatus === 'waiting-jurors' || publicStatus === 'running');
  const showLocalProps = !serverDriven && !guest && !replay && session.status === 'active' && session.turns.length > 0;
  const canReact = showLocalProps || (publicStatus === 'running' && !!juror?.seated);
  const juryOpen = platformGame ? publicStatus === 'waiting-jury' && juryWinner === 'pending' : session.status === 'awaiting-ruling';
  const verdictPending = publicStatus === 'waiting-verdict' || (publicStatus === 'waiting-jury' && juryWinner !== 'pending');
  const preparingVerdict = party && publicStatus === 'running' && platformGame.verdict.flow === 'prepared' && !platformGame.verdict.prepared && session.pendingTurns.length === 1;
  const [viewIndex, setViewIndex] = useState<number | null>(replay || serverDriven ? 0 : null);
  const [displayedText, setDisplayedText] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(speech.getVoiceEnabled());
  const [voiceDone, setVoiceDone] = useState(true);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [draft, setDraft] = useState('');
  const [activeReactions, setActiveReactions] = useState<JuryReaction[]>([]);
  const [activeShout, setActiveShout] = useState<string>();
  const lastReactionId = useRef<number>();
  const localReactionId = useRef(0);
  const reactionTimers = useRef(new Map<number, number>());
  const finishTyping = useRef<() => void>(() => {});
  const previousPublicStatus = useRef(publicStatus);
  const lastIndex = session.turns.length - 1;
  const displayedIndex = Math.min(viewIndex ?? lastIndex, lastIndex);
  const turn: CourtTurn | undefined = session.turns[displayedIndex];
  const reviewing = viewIndex !== null && displayedIndex < lastIndex;
  const cast = getCourtCast(session.caseData);
  const nextRole = getNextCourtRole(session);
  const text = turn?.text || '';
  const typingDone = displayedText === text;
  const reactionTarget = platformGame
    ? session.turns[lastIndex]?.speaker || 'judge'
    : turn?.speaker;
  const messageLength = [...draft.trim()].length;

  const displayReaction = useCallback((reaction: JuryReaction) => {
    if (reaction.kind === 'prop') PROPS[reaction.prop].sound();
    setActiveReactions(previous => [...previous, reaction]);
    const timers = reactionTimers.current;
    const timeout = window.setTimeout(() => {
      timers.delete(reaction.id);
      setActiveReactions(previous => previous.filter(item => item.id !== reaction.id));
    }, reaction.kind === 'prop' ? 1900 : 8000);
    timers.set(reaction.id, timeout);
  }, []);

  useEffect(() => {
    const timers = reactionTimers.current;
    return () => {
      timers.forEach(timer => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);
  useEffect(() => {
    if (!audience) return;
    const previous = lastReactionId.current;
    lastReactionId.current = audience.reactions.reduce((latest, reaction) => Math.max(latest, reaction.id), previous ?? 0);
    if (previous === undefined) return;
    for (const reaction of audience.reactions) {
      if (reaction.id > previous) displayReaction(reaction);
    }
  }, [audience, displayReaction]);

  const useProp = (prop: JuryProp) => {
    if (!canReact || juror?.busy || !reactionTarget) return;
    if (juror) void juror.react({ kind: 'prop', prop });
    else displayReaction({ id: --localReactionId.current, kind: 'prop', prop, target: reactionTarget });
  };

  const sendDanmaku = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!juror || !canReact || juror.busy || messageLength === 0 || messageLength > DANMAKU_LIMIT) return;
    if (await juror.react({ kind: 'message', text: draft.trim() })) {
      setDraft(current => current === draft ? '' : current);
    }
  };

  useEffect(() => { setViewIndex(replay || serverDriven ? 0 : null); }, [session.id, replay, serverDriven]);
  useEffect(() => {
    const previous = previousPublicStatus.current;
    previousPublicStatus.current = publicStatus;
    if (previous && previous !== 'completed' && publicStatus === 'completed') {
      setViewIndex(lastIndex);
      onAutoPlayingChange(true);
    }
  }, [publicStatus, lastIndex, onAutoPlayingChange]);
  useEffect(() => {
    setDisplayedText('');
    let position = 0;
    const timer = window.setInterval(() => {
      position = Math.min(text.length, position + 2);
      setDisplayedText(text.slice(0, position));
      if (position >= text.length) window.clearInterval(timer);
    }, 22);
    finishTyping.current = () => { window.clearInterval(timer); setDisplayedText(text); };
    return () => window.clearInterval(timer);
  }, [text, turn?.id]);
  useEffect(() => {
    let active = true;
    setVoiceUnavailable(false);
    if (!turn || !voiceEnabled) { setVoiceDone(true); return; }
    setVoiceDone(false);
    const currentLang = ((typeof localStorage !== 'undefined' && localStorage.getItem('court_lang')) as any) || 'zh_CN';
    void speech.speak(turn.text, turn.speaker, currentLang, cast.voices[turn.speaker]).then(result => {
      if (!active) return;
      setVoiceDone(true);
      if (result === 'unavailable') setVoiceUnavailable(true);
    });
    return () => { active = false; speech.stop(); };
  }, [turn?.id, voiceEnabled, cast.id]);
  useEffect(() => {
    if (!turn || reviewing || replay) return;
    if (turn.shout) {
      setActiveShout(turn.id);
      SHOUTS[turn.shout].sound();
    } else if (turn.speaker === 'judge') sounds.playGavel();
    else if (turn.emotion === 'angry' || turn.emotion === 'shocked') sounds.playDeskSlam();
    if (turn.evidenceIds.length) sounds.playEvidence();
    if (!turn.shout) return;
    const timer = window.setTimeout(() => setActiveShout(undefined), 1200);
    return () => window.clearTimeout(timer);
  }, [turn?.id]);
  useEffect(() => {
    if (!autoPlaying || busy || error || !typingDone || !voiceDone) return;
    if (reviewing) {
      const timer = window.setTimeout(() => setViewIndex(displayedIndex + 1), Math.max(1400, text.length * 55) / speed);
      return () => window.clearTimeout(timer);
    }
    if (replay) { onAutoPlayingChange(false); return; }
    if (session.status === 'completed') {
      const timer = window.setTimeout(() => { onAutoPlayingChange(false); onOpenVerdict(); }, Math.max(1800, text.length * 30) / speed);
      return () => window.clearTimeout(timer);
    }
    if (juryOpen && canVote) {
      const timer = window.setTimeout(() => { onAutoPlayingChange(false); onOpenVote(); }, Math.max(1800, text.length * 30) / speed);
      return () => window.clearTimeout(timer);
    }
    if (guest || serverDriven) return;
    const timer = window.setTimeout(onAdvance, text ? Math.max(1700, text.length * 44) / speed : 220);
    return () => window.clearTimeout(timer);
  }, [autoPlaying, busy, error, typingDone, voiceDone, reviewing, displayedIndex, text, speed, replay, session.status, juryOpen, canVote, guest, serverDriven, onAdvance, onAutoPlayingChange, onOpenVote, onOpenVerdict]);

  const showPrevious = () => { onAutoPlayingChange(false); setViewIndex(Math.max(0, displayedIndex - 1)); };
  const showNext = () => {
    if (!typingDone) { finishTyping.current(); return; }
    if (reviewing) { setViewIndex(displayedIndex + 1); return; }
    setViewIndex(null);
    if (juryOpen || verdictPending) onOpenVote();
    else if (session.status === 'completed') onOpenVerdict();
    else if (!guest && !replay && !serverDriven) onAdvance();
  };
  const activePhase = !reviewing && verdictPending ? 'verdict' : !reviewing && juryOpen ? 'deliberation' : turn?.phase || session.phase;
  const evidence = turn?.evidenceIds.map(id => session.evidences.find(item => item.id === id)).filter(Boolean) || [];
  const balance = getCourtBalance({ ...session, turns: session.turns.slice(0, displayedIndex + 1) });
  const danmaku = activeReactions.filter(reaction => reaction.kind === 'message');
  const seatingHint = party ? undefined : publicStatus === 'waiting-jurors'
    ? audience && `还差 ${Math.max(0, audience.required - audience.seated)} 位就开庭。`
    : publicStatus === 'running' && !juror?.seated ? '想投票？趁封卷前坐下。' : undefined;

  return (
    <section className="court-stage" aria-label="互联网法庭庭审现场">
      <div className="court-case-strip">
        <div><span className="court-eyebrow">{session.appeal ? '二审开庭' : party ? '案由' : '今日开庭'}</span><h1>{session.caseData.title}</h1></div>
        {!party && <span className={'court-mode court-mode--' + session.mode}>{serverDriven ? '玩家 Agent 出庭' : session.mode === 'live' ? '实时 Agent 对辩' : '全员就位排练'}</span>}
      </div>
      <div className="court-case-brief"><span>{session.caseData.caseNumber}</span><p>{party && <strong>诉求　</strong>}{session.caseData.coreClash}</p></div>
      {session.appeal && <p className="court-appeal-note">一审已归档 · {ROLE_LABELS[session.appeal.role]}提出复核：{session.appeal.reason}</p>}
      <nav className="court-phases" aria-label="庭审进程">
        {Object.entries(PHASE_LABELS).map(([phase, label], index) => <span key={phase} className={activePhase === phase ? 'is-current' : ''} aria-current={activePhase === phase ? 'step' : undefined}><i>{index + 1}</i>{label}</span>)}
      </nav>
      {audience && <section className="court-juror-bar" aria-labelledby="court-juror-title">
        <div className="court-juror-bar__info">
          <Armchair size={25} aria-hidden="true" />
          <div>
            <h2 id="court-juror-title">{publicParty ? '陪审团' : party ? '当事人席' : '真人陪审席'}</h2>
            {seatingHint && <p>{seatingHint}</p>}
          </div>
        </div>
        <div className="court-juror-bar__status" role="status">
          <span>{publicParty ? `${audience.publicJurors ?? 0} 位陪审员 · ${audience.seated} 位当事人` : `${audience.seated} 人入席`}{!party && publicStatus === 'waiting-agents' ? ` · 开庭需 ${audience.required} 人` : ''}</span>
          {juror?.seated ? <strong><Check size={15} aria-hidden="true" />{juror.participant ? '你是当事人' : publicParty ? '你已加入陪审团' : '你已入席'}</strong> : <span>你在旁听</span>}
        </div>
        {seatingOpen && juror?.join && !juror.seated && <button type="button" className="court-button court-button--primary" onClick={juror.join} disabled={juror.busy}>{juror.busy ? '正在入席…' : '我要参加陪审团'}</button>}
        {juror?.error && (!juror.seated || publicStatus !== 'running') && <p className="court-juror-bar__error" role="alert">{juror.error}</p>}
      </section>}
      <div className="court-theatre">
        <div className="court-scale-bar" role="group" aria-label="辩论气势">
          <span className="court-scale-label court-scale-label--plaintiff">原告</span>
          <div className="court-scale-center">
            <div className="court-scale-beam" aria-hidden="true" style={{ transform: `rotate(${balance * -0.14}deg)` }}>
              <div className="court-scale-pan court-scale-pan--left" />
              <Scale size={22} />
              <div className="court-scale-pan court-scale-pan--right" />
            </div>
            <p>{balance > 15 ? '原告气势占优' : balance < -15 ? '被告气势占优' : '双方旗鼓相当'}</p>
          </div>
          <span className="court-scale-label court-scale-label--defendant">被告</span>
        </div>
        {turn?.shout && activeShout === turn.id && <div className={'court-shout-banner court-shout-banner--' + turn.shout.toLowerCase()}>
          <div className="court-shout-banner__inner">
            <span>{ROLE_LABELS[turn.speaker]}拍案</span>
            <strong>{SHOUTS[turn.shout].label}</strong>
          </div>
        </div>}
        {audience && <div className="court-danmaku-lane" role="log" aria-label="实时弹幕">
          {danmaku.map(item => <div key={item.id} className="court-danmaku-item" style={{ top: `${6 + (item.id % 3) * 27}px` }}>{item.text}</div>)}
        </div>}
        <div className="court-actors">
          {ORDER.map(role => {
            const profile = getCourtRoleProfile(session.caseData, role);
            const active = turn?.speaker === role;
            const ownPrevious = session.turns.slice(0, displayedIndex + 1).filter(item => item.speaker === role).slice(-1)[0];
            const emotion = active ? turn?.emotion : turn?.emotion === 'angry' && role !== 'judge' ? 'shocked' : ownPrevious?.emotion;
            const reaction = activeReactions.filter(item => item.kind === 'prop' && item.target === role).slice(-1)[0];
            const prop = reaction?.kind === 'prop' ? reaction.prop : undefined;
            const seat = seats?.[role];
            const partySeat = party && seat
              ? role === 'judge' ? undefined
                : seat.status === 'open' ? '等待应诉'
                : seat.status === 'reserved' ? '等待出庭'
                : seat.status === 'claimed' ? seat.agentName || '已出庭' : '法庭代辩'
              : undefined;
            return <div className={'court-actor court-actor--' + role + (active ? ' is-speaking' : '')} key={role}>
              {prop && reaction && <div key={reaction.id} className={'court-actor-reaction court-actor-reaction--' + prop}>
                <span className="court-stun-badge" role="status">{PROPS[prop].reaction}</span>
                <span className="court-splat-overlay" aria-hidden="true">{PROPS[prop].icon}</span>
              </div>}
              <div className="court-actor__cue">{busy && !reviewing && nextRole === role ? <><LoaderCircle size={13} className="is-spinning" />正在斟酌</> : active ? <><span className="speaking-dot" />{ROLE_LABELS[role]}发言</> : role === 'judge' ? '主持审理' : party ? '当事人席' : '本人出庭'}</div>
              <CharacterPortrait role={role} cast={cast} expression={getCourtExpression(emotion, active && !typingDone)} label={profile.name} />
              <div className="court-actor__bench"><span>{ROLE_LABELS[role]}席</span><strong>{profile.name}</strong>{party ? (partySeat && <small>{partySeat}</small>) : seat && <small>{seat.source === 'practice' ? '系统陪练' : seat.source === 'builtin' ? '内置主审' : seat.status === 'claimed' ? seat.agentName || '玩家 Agent' : '等待玩家 Agent'}</small>}</div>
              {!party && onJoinRole && (!serverDriven || seat?.status === 'open' || seat?.status === 'reserved') && <button className="court-seat-invite" onClick={() => onJoinRole(role)}>让我的 Agent 当{ROLE_LABELS[role]}</button>}
            </div>;
          })}
        </div>
        <div className="court-dialogue" data-speaker={turn?.speaker || 'judge'}>
          {turn && <div className="court-dialogue__heading"><span>{ROLE_LABELS[turn.speaker]} · {turn.speakerName}</span><small>{reviewing || replay ? '庭审回看' : busy ? '下一位准备发言' : PHASE_LABELS[activePhase]}</small></div>}
          {turn ? <button className="court-dialogue__text" onClick={() => finishTyping.current()} title="显示完整发言"><span aria-hidden="true">{displayedText}{!typingDone && <i className="type-cursor" />}</span><span className="sr-only">{turn.text}</span></button>
            : <div className="court-dialogue__welcome"><h2>{serverDriven ? (publicStatus === 'running' ? '等法官开口。' : '还没开庭。') : '案子摆好了，敲槌开庭。'}</h2></div>}
          {evidence.length > 0 && <div className="court-presented-evidence"><BookOpen size={15} /><span>本轮证物：</span>{evidence.map(item => item && <button key={item.id} onClick={() => setShowEvidence(true)}>{item.name}</button>)}</div>}
        </div>
        {(showLocalProps || (audience && publicStatus === 'running' && (!party || canReact))) && <div className="court-juror-tools" aria-label="陪审互动">
          <div className="court-juror-tools__props">
            <p>{!canReact ? '入席就能扔。' : reactionTarget && `瞄准${ROLE_LABELS[reactionTarget]}席`}</p>
            <div className="court-juror-tools__buttons">
              {PROP_NAMES.map(prop => <button type="button" key={prop} className={'court-prop-btn court-prop-btn--' + prop} onClick={() => useProp(prop)} disabled={!canReact || juror?.busy || !reactionTarget}>
                <span aria-hidden="true">{PROPS[prop].icon}</span>{PROPS[prop].label}
              </button>)}
            </div>
          </div>
          {audience && <form className="court-danmaku-form" onSubmit={sendDanmaku}>
            <label htmlFor="court-danmaku-draft" className="sr-only">实时弹幕</label>
            <input id="court-danmaku-draft" type="text" value={draft} onChange={event => setDraft(event.target.value)} disabled={!canReact} placeholder={`说两句（最多 ${DANMAKU_LIMIT} 字）`} aria-invalid={messageLength > DANMAKU_LIMIT} />
            {messageLength > DANMAKU_LIMIT && <span className="court-danmaku-form__limit" role="status">弹幕最多 {DANMAKU_LIMIT} 字</span>}
            <button type="submit" className="court-button" disabled={!canReact || juror?.busy || !messageLength || messageLength > DANMAKU_LIMIT}>发送弹幕</button>
          </form>}
          {juror?.seated && juror.error && <p className="court-juror-tools__error" role="alert">{juror.error}</p>}
        </div>}
      </div>
      {error && <div className="court-runtime-error" role="alert"><strong>这一轮暂未完成</strong><p>{error}</p><button className="court-button" onClick={onAdvance} disabled={busy || guest}>重试这一轮</button><button className="court-button" onClick={onOpenAgents}>检查 Agent 设置</button></div>}
      {voiceUnavailable && <p className="court-inline-note" role="status">本机语音暂不可用，已保留完整字幕。</p>}
      <div className="court-controls">
        <div className="court-controls__playback">
          <button className="court-icon-button" onClick={showPrevious} disabled={displayedIndex <= 0} aria-label="回看上一句"><ArrowLeft size={18} /></button>
          <button className="court-button court-button--primary" disabled={busy || (serverDriven && !turn) || (guest && !reviewing) || (!!session.ruling && !reviewing)} onClick={() => { setViewIndex(serverDriven ? Math.max(0, displayedIndex) : reviewing ? displayedIndex : null); onAutoPlayingChange(!autoPlaying); }}>
            {busy ? <LoaderCircle className="is-spinning" size={17} /> : autoPlaying ? <Pause size={17} /> : <Play size={17} />}
            {busy ? ROLE_LABELS[nextRole || 'judge'] + '组织语言中…' : autoPlaying ? '暂停' : reviewing ? '播放回看' : serverDriven ? session.turns.length ? '继续观看' : (publicStatus === 'waiting-jurors' ? (party ? '等朋友应诉' : '等待陪审员入席') : '等待开庭') : session.turns.length ? '继续激辩' : '开庭！'}
          </button>
          <button className="court-icon-button" onClick={showNext} disabled={busy || (!reviewing && (guest || serverDriven))} aria-label={reviewing ? '回看下一句' : '下一轮'}><ArrowRight size={18} /></button>
          <span className="court-turn-count">{Math.max(0, displayedIndex + 1)} / {session.turns.length} 句</span>
        </div>
        <div className="court-controls__tools">
          <button className="court-icon-button" onClick={() => { const enabled = speech.toggleVoice(); setVoiceEnabled(enabled); if (!enabled) { speech.stop(); setVoiceDone(true); } }} aria-label={voiceEnabled ? '关闭角色配音' : '开启角色配音'} aria-pressed={voiceEnabled}>{voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
          <button className="court-button" onClick={() => setSpeed(speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1)} aria-label={'当前播放速度 ' + speed + ' 倍，点击切换'}>{speed}×</button>
          <button className="court-button" onClick={() => setShowEvidence(true)}><BookOpen size={16} />证物 <span>{session.evidences.length}</span></button>
          <button className="court-button" onClick={() => setShowTranscript(!showTranscript)} aria-expanded={showTranscript}>庭审记录</button>
        </div>
      </div>
      {preparingVerdict && <p className="court-inline-note" role="status">法官正在整理判词。</p>}
      {juryOpen && <div className="court-jury-call"><Vote size={25} /><strong>{party && !publicParty ? '庭审结束，当事人投票。' : '封卷。轮到陪审团了。'}</strong><button className={canVote ? 'court-button court-button--primary' : 'court-button'} onClick={onOpenVote}>{canVote ? '去投票' : '看票数'}<ArrowRight size={16} /></button></div>}
      {verdictPending && <div className="court-jury-call" role="status"><Gavel size={24} /><div><strong>等法官宣判</strong><p>{juryWinner === 'draw' ? '双方票数相同。' : juryWinner === 'plaintiff' ? '原告得票更多。' : juryWinner === 'defendant' ? '被告得票更多。' : '投票已结束。'}</p></div><button className="court-button" onClick={onOpenVote}>看票数</button></div>}
      {!serverDriven && session.juryVote && session.juryVote !== 'draw' && session.status !== 'completed' && <div className="court-jury-call"><Check size={22} /><p>陪审意志已送达：力挺{ROLE_LABELS[session.juryVote]}！法官即将落槌宣判！</p>{!autoPlaying && !guest && !serverDriven && <button className="court-button court-button--primary" onClick={onAdvance} disabled={busy}><Gavel size={16} />听法官宣判</button>}</div>}
      {session.status === 'completed' && <div className="court-jury-call"><Gavel size={24} /><div><strong>本案已宣判</strong><p>{session.ruling?.result}</p></div><button className="court-button court-button--primary" onClick={onOpenVerdict}>查阅判决书</button><button className="court-button" onClick={() => { setViewIndex(0); onAutoPlayingChange(true); }}><RotateCcw size={15} />回看庭审</button></div>}
      {showTranscript && <ol className="court-transcript" aria-label="已发生的庭审记录">{session.turns.map((item, index) => <li key={item.id}><button onClick={() => { onAutoPlayingChange(false); setViewIndex(index); }}><span>{index + 1} · {ROLE_LABELS[item.speaker]}</span><p>{item.text}</p></button></li>)}</ol>}
      <div className="court-stage-footer"><span>阵容出镜：{cast.name}</span><button onClick={onOpenCast}>{serverDriven ? '查看出庭阵容' : '换批演员'}</button></div>
      <EvidenceLockerModal isOpen={showEvidence} onClose={() => setShowEvidence(false)} evidences={session.evidences} />
    </section>
  );
};
