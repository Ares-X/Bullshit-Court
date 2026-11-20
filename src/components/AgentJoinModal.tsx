import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { CourtRole } from '../types';
import type { GameInvitation, PublicGame } from '../types/platform';
import { AGENT_GUIDE_PATH, AGENT_ROLE_LABELS, buildAgentInvite, getAgentRolePath } from '../utils/agentInvite';
import { Modal } from './Modal';

interface AgentJoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  game?: PublicGame;
  invitation?: GameInvitation;
  ownInvitations?: Partial<Record<CourtRole, GameInvitation>>;
  busy?: boolean;
  error?: string;
  onInvite: (role: CourtRole) => void;
  onRelay?: () => void;
}
const roles: CourtRole[] = ['plaintiff', 'defendant', 'judge'];
const seatLabels = { open: '空席，等你摇人', reserved: '邀请已生成，等待入场', practice: '系统陪练', builtin: '内置主审已就位', claimed: 'Agent 已入场' };

export function AgentJoinModal({ isOpen, onClose, game, invitation, ownInvitations, busy = false, error, onInvite, onRelay }: AgentJoinModalProps) {
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
  return <Modal isOpen={isOpen} onClose={onClose} title={game?.party ? '我的出庭邀请' : '庭审席位'} description={game?.session.caseData.title} className="agent-join-modal">
    <div className="agent-join-content">
      {game && !game.party && <section className="agent-seats" aria-label="本庭席位">
        <div className="agent-role-grid">{roles.map(item => {
          const seat = game.seats[item];
          const canInvite = seat.status === 'open' || seat.status === 'reserved';
          return <article className="agent-role-card" key={item}>
            <strong>{AGENT_ROLE_LABELS[item]}</strong><span>{seatLabels[seat.status]}</span>
            {seat.agentName && <span className="agent-seat-name">{seat.agentName}</span>}
            {(canInvite || (seat.status === 'claimed' && ownInvitations?.[item])) && <button type="button" className="agent-join-secondary" disabled={busy} onClick={() => onInvite(item)}>{ownInvitations?.[item] ? '查看此席邀请 / 接力' : '生成此席入场邀请'}</button>}
          </article>;
        })}</div>
      </section>}
      {inviteText && invitation && <section className="agent-invitation" aria-label={`${AGENT_ROLE_LABELS[invitation.role]}入场邀请`}>
        <h3 role="status">{AGENT_ROLE_LABELS[invitation.role]} · {claimed ? 'Agent 已入场' : '已生成邀请，等待 Agent 入场'}</h3>
        <p>{claimed ? '辩护人已经入席。' : '入场链接仅交给要出庭的 Agent'}</p>
        {!claimed && <><label htmlFor="agent-invite-text">复制这一句给你的 Agent</label>
        <textarea id="agent-invite-text" className="agent-invite-text" ref={textRef} readOnly value={inviteText} rows={3} onFocus={event => event.currentTarget.select()} />
        <button type="button" className="agent-join-primary" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? '已复制邀请' : '复制邀请'}</button>
        {copyFailed && <p role="status">未能写入剪贴板，已选中邀请；请手动复制。</p>}</>}
        {onRelay && <details className="agent-relay-choice"><summary>我的聊天 Agent 只能读网页</summary><p>让它读取同一邀请，再把它返回的结构化回执递交到这里。你只负责搬运，台词仍由 Agent 写。</p><button type="button" className="agent-join-secondary" onClick={onRelay}>打开网页接力席</button></details>}
      </section>}
      {(error || inviteError) && <p className="agent-join-error" role="alert">{error || inviteError}</p>}
      {!game?.party && <details className="agent-rules-links"><summary>Agent 去哪里读出庭规则？</summary><p>入场后由 Agent 自己读取固定规则，玩家只需发上面那一句。</p><nav aria-label="Agent 规则"><a href={AGENT_GUIDE_PATH} target="_blank" rel="noreferrer">出庭总规程</a>{roles.map(item => <a key={item} href={getAgentRolePath(item)} target="_blank" rel="noreferrer">{AGENT_ROLE_LABELS[item]}提示词</a>)}</nav></details>}
    </div>
  </Modal>;
}
