import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Gavel, LoaderCircle, Pause, Play, RotateCcw, Scale, Volume2, VolumeX, Vote } from 'lucide-react';
import type { CourtRole, CourtSession, CourtTurn } from '../types';
import type { PublicSeat } from '../types/platform';
import { getCourtRoleProfile, getNextCourtRole } from '../utils/courtRuntime';
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
  serverDriven?: boolean; seats?: Record<CourtRole, PublicSeat>; onJoinRole?: (role: CourtRole) => void;
}
const PHASE_LABELS = { opening: '开庭', statements: '双方陈述', inquiry: '法官追问', evidence: '当庭举证', deliberation: '陪审表决', verdict: '法官宣判' };
const ROLE_LABELS: Record<CourtRole, string> = { plaintiff: '原告', judge: '法官', defendant: '被告' };
const ORDER: CourtRole[] = ['plaintiff', 'judge', 'defendant'];

export const CourtStage: React.FC<CourtStageProps> = ({ session, busy, error, autoPlaying, onAutoPlayingChange, onAdvance, onOpenVote, onOpenCast, onOpenAgents, onOpenVerdict, guest = false, replay = false, serverDriven = false, seats, onJoinRole }) => {
  const [viewIndex, setViewIndex] = useState<number | null>(replay || serverDriven ? 0 : null);
  const [displayedText, setDisplayedText] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(speech.getVoiceEnabled());
  const [voiceDone, setVoiceDone] = useState(true);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [speed, setSpeed] = useState(1);
  const finishTyping = useRef<() => void>(() => {});
  const lastIndex = session.turns.length - 1;
  const displayedIndex = Math.min(viewIndex ?? lastIndex, lastIndex);
  const turn: CourtTurn | undefined = session.turns[displayedIndex];
  const reviewing = viewIndex !== null && displayedIndex < lastIndex;
  const cast = getCourtCast(session.caseData);
  const nextRole = getNextCourtRole(session);
  const text = turn?.text || '';
  const typingDone = displayedText === text;

  useEffect(() => { setViewIndex(replay || serverDriven ? 0 : null); }, [session.id, replay, serverDriven]);
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
    if (turn.speaker === 'judge') sounds.playGavel();
    else if (turn.emotion === 'angry' || turn.emotion === 'shocked') sounds.playDeskSlam();
    if (turn.evidenceIds.length) sounds.playEvidence();
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
    if (session.status === 'awaiting-ruling') {
      const timer = window.setTimeout(() => { onAutoPlayingChange(false); onOpenVote(); }, Math.max(1800, text.length * 30) / speed);
      return () => window.clearTimeout(timer);
    }
    if (guest || serverDriven) return;
    const timer = window.setTimeout(onAdvance, text ? Math.max(1700, text.length * 44) / speed : 220);
    return () => window.clearTimeout(timer);
  }, [autoPlaying, busy, error, typingDone, voiceDone, reviewing, displayedIndex, text, speed, replay, session.status, guest, serverDriven, onAdvance, onAutoPlayingChange, onOpenVote, onOpenVerdict]);

  const showPrevious = () => { onAutoPlayingChange(false); setViewIndex(Math.max(0, displayedIndex - 1)); };
  const showNext = () => {
    if (!typingDone) { finishTyping.current(); return; }
    if (reviewing) { setViewIndex(displayedIndex + 1); return; }
    setViewIndex(null);
    if (session.status === 'awaiting-ruling') onOpenVote();
    else if (session.status === 'completed') onOpenVerdict();
    else if (!guest && !replay && !serverDriven) onAdvance();
  };
  const activePhase = turn?.phase || session.phase;
  const evidence = turn?.evidenceIds.map(id => session.evidences.find(item => item.id === id)).filter(Boolean) || [];

  return (
    <section className="court-stage" aria-label="互联网法庭庭审现场">
      <div className="court-case-strip">
        <div><span className="court-eyebrow">{session.appeal ? '二审开庭' : '今日开庭'}</span><h1>{session.caseData.title}</h1></div>
        <span className={'court-mode court-mode--' + session.mode}>{serverDriven ? '玩家 Agent 出庭' : session.mode === 'live' ? '实时 Agent 对辩' : '全员就位排练'}</span>
      </div>
      <div className="court-case-brief"><span>{session.caseData.caseNumber}</span><p>{session.caseData.coreClash}</p></div>
      {session.appeal && <p className="court-appeal-note">一审已归档 · {ROLE_LABELS[session.appeal.role]}提出复核：{session.appeal.reason}</p>}
      <nav className="court-phases" aria-label="庭审进程">
        {Object.entries(PHASE_LABELS).map(([phase, label], index) => <span key={phase} className={activePhase === phase || (phase === 'deliberation' && session.status === 'awaiting-ruling') ? 'is-current' : ''} aria-current={activePhase === phase ? 'step' : undefined}><i>{index + 1}</i>{label}</span>)}
      </nav>
      <div className="court-theatre">
        <div className="court-theatre__sign"><Scale size={20} /><span>小事也要说个明白</span><Scale size={20} /></div>
        <div className="court-actors">
          {ORDER.map(role => {
            const profile = getCourtRoleProfile(session.caseData, role);
            const active = turn?.speaker === role;
            const ownPrevious = session.turns.slice(0, displayedIndex + 1).filter(item => item.speaker === role).slice(-1)[0];
            const emotion = active ? turn?.emotion : turn?.emotion === 'angry' && role !== 'judge' ? 'shocked' : ownPrevious?.emotion;
            return <div className={'court-actor court-actor--' + role + (active ? ' is-speaking' : '')} key={role}>
              <div className="court-actor__cue">{busy && !reviewing && nextRole === role ? <><LoaderCircle size={13} className="is-spinning" />正在斟酌</> : active ? <><span className="speaking-dot" />{ROLE_LABELS[role]}发言</> : role === 'judge' ? '主持审理' : '本人出庭'}</div>
              <CharacterPortrait role={role} cast={cast} expression={getCourtExpression(emotion, active && !typingDone)} label={profile.name} />
              <div className="court-actor__bench"><span>{ROLE_LABELS[role]}席</span><strong>{profile.name}</strong>{seats?.[role] && <small>{seats[role].source === 'practice' ? '系统陪练' : seats[role].status === 'claimed' ? seats[role].agentName || '玩家 Agent' : '等待玩家 Agent'}</small>}</div>
              {onJoinRole && (!serverDriven || seats?.[role].status === 'open' || seats?.[role].status === 'reserved') && <button className="court-seat-invite" onClick={() => onJoinRole(role)}>让我的 Agent 当{ROLE_LABELS[role]}</button>}
            </div>;
          })}
        </div>
        <div className="court-dialogue" data-speaker={turn?.speaker || 'judge'}>
          <div className="court-dialogue__heading"><span>{turn ? ROLE_LABELS[turn.speaker] + ' · ' + turn.speakerName : '三位已经就位'}</span><small>{reviewing || replay ? '庭审回看' : busy ? '下一位准备发言' : turn ? PHASE_LABELS[turn.phase] : '等你入席'}</small></div>
          {turn ? <button className="court-dialogue__text" onClick={() => finishTyping.current()} title="显示完整发言"><span aria-hidden="true">{displayedText}{!typingDone && <i className="type-cursor" />}</span><span className="sr-only">{turn.text}</span></button>
            : <div className="court-dialogue__welcome"><h2>{serverDriven ? '席位已经摆好，等你的 Agent 登台开辩。' : '让 Agent 吵个痛快，真人陪审团一票定胜负！'}</h2><p>{serverDriven ? '把短邀请发给你的 Agent，它自己读规则、按轮次出庭辩论；真人陪审团掌握最终裁决权。' : '原告当庭诉苦，被告绝地反驳，法官步步追问。谁在理，全看真人陪审团！'}</p><p className="court-source-note">{serverDriven ? '庭审云端实时同步，随进随出不丢记录。' : session.mode === 'rehearsal' ? '当前为单机即席排练。点击席位按钮，即可派出你自己的专属 Agent 入场！' : '原告、被告与法官各自连入模型，按共同案卷实时交锋。'}</p></div>}
          {evidence.length > 0 && <div className="court-presented-evidence"><BookOpen size={15} /><span>本轮证物：</span>{evidence.map(item => item && <button key={item.id} onClick={() => setShowEvidence(true)}>{item.name}</button>)}</div>}
          {turn && turn.responseTo.length > 0 && <p className="court-response-note">本轮回应了 {turn.responseTo.length} 条此前陈述或材料</p>}
        </div>
      </div>
      {error && <div className="court-runtime-error" role="alert"><strong>这一轮暂未完成</strong><p>{error}</p><button className="court-button" onClick={onAdvance} disabled={busy || guest}>重试这一轮</button><button className="court-button" onClick={onOpenAgents}>检查 Agent 设置</button></div>}
      {voiceUnavailable && <p className="court-inline-note" role="status">本机语音暂不可用，已保留完整字幕。</p>}
      <div className="court-controls">
        <div className="court-controls__playback">
          <button className="court-icon-button" onClick={showPrevious} disabled={displayedIndex <= 0} aria-label="回看上一句"><ArrowLeft size={18} /></button>
          <button className="court-button court-button--primary" disabled={busy || (serverDriven && !turn) || (guest && !reviewing) || (!!session.ruling && !reviewing)} onClick={() => { setViewIndex(serverDriven ? Math.max(0, displayedIndex) : reviewing ? displayedIndex : null); onAutoPlayingChange(!autoPlaying); }}>
            {busy ? <LoaderCircle className="is-spinning" size={17} /> : autoPlaying ? <Pause size={17} /> : <Play size={17} />}
            {busy ? ROLE_LABELS[nextRole || 'judge'] + '组织语言中…' : autoPlaying ? '暂停' : reviewing ? '播放回看' : serverDriven ? session.turns.length ? '继续观看' : '等待辩护人就位' : session.turns.length ? '继续激辩' : '开庭！'}
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
      {session.status === 'awaiting-ruling' && (!serverDriven || !reviewing) && <div className="court-jury-call"><Vote size={25} /><div><strong>双方已经吵得面红耳赤！全网陪审官，请决断！</strong><p>控辩双方均已亮出底牌，你的正义一票将直接决定最终裁决！</p></div><button className="court-button court-button--primary" onClick={onOpenVote}>进入陪审投票<ArrowRight size={16} /></button></div>}
      {session.juryVote && session.status !== 'completed' && <div className="court-jury-call"><Check size={22} /><p>陪审意志已送达：力挺{ROLE_LABELS[session.juryVote]}！法官即将落槌宣判！</p>{!autoPlaying && !guest && !serverDriven && <button className="court-button court-button--primary" onClick={onAdvance} disabled={busy}><Gavel size={16} />听法官宣判</button>}</div>}
      {session.status === 'completed' && <div className="court-jury-call"><Gavel size={24} /><div><strong>本案已宣判</strong><p>{session.ruling?.result}</p></div><button className="court-button court-button--primary" onClick={onOpenVerdict}>查阅判决书</button><button className="court-button" onClick={() => { setViewIndex(0); onAutoPlayingChange(true); }}><RotateCcw size={15} />回看庭审</button></div>}
      {showTranscript && <ol className="court-transcript" aria-label="已发生的庭审记录">{session.turns.map((item, index) => <li key={item.id}><button onClick={() => { onAutoPlayingChange(false); setViewIndex(index); }}><span>{index + 1} · {ROLE_LABELS[item.speaker]}</span><p>{item.text}</p></button></li>)}</ol>}
      <div className="court-stage-footer"><span>阵容出镜：{cast.name}</span><button onClick={onOpenCast}>换批演员</button><span>最高法庭 · 现场公决</span></div>
      <EvidenceLockerModal isOpen={showEvidence} onClose={() => setShowEvidence(false)} evidences={session.evidences} />
    </section>
  );
};