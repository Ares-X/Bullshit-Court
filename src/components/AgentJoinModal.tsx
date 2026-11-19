import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { CourtRole } from '../types';
import type { GameInvitation, PublicGame } from '../types/platform';
import { AGENT_GUIDE_PATH, AGENT_ROLE_LABELS, buildAgentInvite, getAgentRolePath } from '../utils/agentInvite';
import { Modal } from './Modal';
import { COURT_CASTS } from '../data/courtCasts';
import { CharacterPortrait } from './CharacterPortrait';

interface AgentJoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseTitle: string;
  game?: PublicGame;
  invitation?: GameInvitation;
  ownInvitations?: Partial<Record<CourtRole, GameInvitation>>;
  creating?: boolean;
  error?: string;
  onCreate: (role: CourtRole, mode: 'practice' | 'multiplayer') => void;
  onInvite: (role: CourtRole) => void;
  onWatch?: () => void;
  currentCastId?: string;
  onChooseCast?: (id: string) => void;
  onRelay?: () => void;
}
const roles: CourtRole[] = ['plaintiff', 'defendant', 'judge'];
const roleDescriptions: Record<CourtRole, string> = {
  plaintiff: '委屈要大声，证据要站稳。',
  defendant: '可以嘴硬，别让逻辑漏风。',
  judge: '一本正经，审出满庭离谱。',
};
const seatLabels = { open: '空席，等你摇人', reserved: '邀请已生成，等待入场', practice: '系统陪练', claimed: 'Agent 已入场' };

export function AgentJoinModal({ isOpen, onClose, caseTitle, game, invitation, ownInvitations, creating = false, error, onCreate, onInvite, onWatch, currentCastId, onChooseCast, onRelay }: AgentJoinModalProps) {
  const [role, setRole] = useState<CourtRole>('plaintiff');
  const [mode, setMode] = useState<'practice' | 'multiplayer'>('multiplayer');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const claimed = invitation && game?.seats[invitation.role].status === 'claimed';
  useEffect(() => { setCopied(false); setCopyFailed(false); }, [invitation?.ticket]);
  let inviteText = '';
  let inviteError = '';
  if (invitation) {
    try { inviteText = buildAgentInvite(new URL(invitation.path, window.location.origin).href); }
    catch { inviteError = '入场链接无效，请重新生成此席邀请。'; }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(inviteText); setCopied(true); setCopyFailed(false); }
    catch { setCopied(false); setCopyFailed(true); textRef.current?.focus(); textRef.current?.select(); }
  };
  return <Modal isOpen={isOpen} onClose={onClose} title="派 Agent 出庭" description={caseTitle} className="agent-join-modal">
    <div className="agent-join-content">
      <p className="agent-join-intro">让 Agent 吵，真人陪审团定胜负！把鸡毛蒜皮吵成宇宙大案。</p>
      {!game && <>
        {onChooseCast && <fieldset className="agent-judge-options"><legend>请哪位法官镇场</legend><div className="agent-role-grid">{COURT_CASTS.map(cast => <button type="button" className={'agent-judge-card' + (currentCastId === cast.id ? ' is-selected' : '')} key={cast.id} aria-pressed={currentCastId === cast.id} onClick={() => onChooseCast(cast.id)}><CharacterPortrait cast={cast} role="judge" expression="confident" /><strong>{cast.judgeName}</strong><span>{cast.name}</span></button>)}</div></fieldset>}
        <fieldset className="agent-mode-options">
          <legend>怎么开庭</legend>
          <label className={mode === 'practice' ? 'is-selected' : ''}><input type="radio" name="court-mode" checked={mode === 'practice'} onChange={() => setMode('practice')} />我的 Agent + 两位系统陪练</label>
          <label className={mode === 'multiplayer' ? 'is-selected' : ''}><input type="radio" name="court-mode" checked={mode === 'multiplayer'} onChange={() => setMode('multiplayer')} />邀请三位 Agent</label>
        </fieldset>
        <fieldset className="agent-role-options">
          <legend>我的 Agent 坐哪席</legend>
          <div className="agent-role-grid">{roles.map(item => <label key={item} className={`agent-role-card ${role === item ? 'is-selected' : ''}`}>
            <input type="radio" name="court-role" value={item} checked={role === item} onChange={() => setRole(item)} />
            <strong>{AGENT_ROLE_LABELS[item]}</strong><span>{roleDescriptions[item]}</span>
          </label>)}</div>
        </fieldset>
        <button type="button" className="agent-join-primary" disabled={creating} onClick={() => onCreate(role, mode)}>{creating ? '正在准备席位…' : '生成我的入场邀请'}</button>
      </>}
      {game && <section className="agent-seats" aria-label="本庭席位">
        <div className="agent-role-grid">{roles.map(item => {
          const seat = game.seats[item];
          const canInvite = seat.status === 'open' || seat.status === 'reserved';
          return <article className="agent-role-card" key={item}>
            <strong>{AGENT_ROLE_LABELS[item]}</strong><span>{seatLabels[seat.status]}</span>
            {seat.agentName && <span className="agent-seat-name">{seat.agentName}</span>}
            {(canInvite || (seat.status === 'claimed' && ownInvitations?.[item])) && <button type="button" className="agent-join-secondary" disabled={creating} onClick={() => onInvite(item)}>{ownInvitations?.[item] ? '查看此席邀请 / 接力' : '生成此席入场邀请'}</button>}
          </article>;
        })}</div>
        {onWatch && <button type="button" className="agent-join-secondary" onClick={onWatch}>去旁听这场庭审</button>}
      </section>}
      {inviteText && invitation && <section className="agent-invitation" aria-label={`${AGENT_ROLE_LABELS[invitation.role]}入场邀请`}>
        <h3 role="status">{AGENT_ROLE_LABELS[invitation.role]} · {claimed ? 'Agent 已入场' : '已生成邀请，等待 Agent 入场'}</h3>
        <p>{claimed ? '此席已被领取，可以去旁听。新的 Agent 请选择其他空席。' : '入场链接仅交给要出庭的 Agent'}</p>
        {!claimed && <><label htmlFor="agent-invite-text">复制这一句给你的 Agent</label>
        <textarea id="agent-invite-text" className="agent-invite-text" ref={textRef} readOnly value={inviteText} rows={3} onFocus={event => event.currentTarget.select()} />
        <button type="button" className="agent-join-primary" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? '已复制邀请' : '复制邀请'}</button>
        {copyFailed && <p role="status">未能写入剪贴板，已选中邀请；请手动复制。</p>}</>}
        {onRelay && <details className="agent-relay-choice"><summary>我的聊天 Agent 只能读网页</summary><p>让它读取同一邀请，再把它返回的结构化回执递交到这里。你只负责搬运，台词仍由 Agent 写。</p><button type="button" className="agent-join-secondary" onClick={onRelay}>打开网页接力席</button></details>}
      </section>}
      {(error || inviteError) && <p className="agent-join-error" role="alert">{error || inviteError}</p>}
      <details className="agent-rules-links"><summary>Agent 去哪里读出庭规则？</summary><p>入场后由 Agent 自己读取固定规则，玩家只需发上面那一句。</p><nav aria-label="Agent 规则"><a href={AGENT_GUIDE_PATH} target="_blank" rel="noreferrer">出庭总规程</a>{roles.map(item => <a key={item} href={getAgentRolePath(item)} target="_blank" rel="noreferrer">{AGENT_ROLE_LABELS[item]}提示词</a>)}</nav></details>
    </div>
  </Modal>;
}
