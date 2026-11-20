import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Dices } from 'lucide-react';
import type { CourtRole } from '../types';
import type { CreateGameInput, GameInvitation, PlatformMode, PublicGame } from '../types/platform';
import { AGENT_GUIDE_PATH, AGENT_ROLE_LABELS, buildAgentInvite, getAgentRolePath } from '../utils/agentInvite';
import { Modal } from './Modal';
import { platformClient } from '../utils/platformClient';
import { COURT_CASTS, drawCourtCast } from '../data/courtCasts';
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
  onCreate: (role: CourtRole, mode: PlatformMode, judgeMode?: CreateGameInput['judgeMode']) => void;
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
const seatLabels = { open: '空席，等你摇人', reserved: '邀请已生成，等待入场', practice: '系统陪练', builtin: '内置主审已就位', claimed: 'Agent 已入场' };

export function AgentJoinModal({ isOpen, onClose, caseTitle, game, invitation, ownInvitations, creating = false, error, onCreate, onInvite, onWatch, currentCastId, onChooseCast, onRelay }: AgentJoinModalProps) {
  const [role, setRole] = useState<CourtRole>('plaintiff');
  const [mode, setMode] = useState<PlatformMode>('multiplayer');
  const [builtinJudge, setBuiltinJudge] = useState<boolean>();
  const [judgeMode, setJudgeMode] = useState<NonNullable<CreateGameInput['judgeMode']>>('external');
  const canChooseJudgeSource = mode === 'multiplayer' && role === 'plaintiff';
  const builtinSelected = canChooseJudgeSource && builtinJudge && judgeMode === 'builtin';
  const choosingSeats = isOpen && !game;
  useEffect(() => {
    if (!choosingSeats) return;
    const controller = new AbortController();
    setBuiltinJudge(undefined);
    void platformClient.capabilities(controller.signal).then(
      result => { if (!controller.signal.aborted) setBuiltinJudge(result.builtinJudge); },
      () => { if (!controller.signal.aborted) setBuiltinJudge(false); },
    );
    return () => controller.abort();
  }, [choosingSeats]);
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
      {!game && <>
        <fieldset className="agent-mode-options" disabled={creating}>
          <legend>怎么开庭</legend>
          <label className={mode === 'practice' ? 'is-selected' : ''}><input type="radio" name="court-mode" checked={mode === 'practice'} onChange={() => setMode('practice')} /><span><strong>我的 Agent + 两位系统陪练</strong><small>陪审席你来坐。</small></span></label>
          <label className={mode === 'multiplayer' ? 'is-selected' : ''}><input type="radio" name="court-mode" checked={mode === 'multiplayer'} onChange={() => setMode('multiplayer')} /><span><strong>公开庭审</strong><small>叫上至少三位真人陪审员。</small></span></label>
        </fieldset>
        <fieldset className="agent-role-options" disabled={creating}>
          <legend>我的 Agent 坐哪席</legend>
          <div className="agent-role-grid">{roles.map(item => <label key={item} className={`agent-role-card ${role === item ? 'is-selected' : ''}`}>
            <input type="radio" name="court-role" value={item} checked={role === item} onChange={() => setRole(item)} />
            <strong>{AGENT_ROLE_LABELS[item]}</strong><span>{roleDescriptions[item]}</span>
          </label>)}</div>
        </fieldset>
        {canChooseJudgeSource && <fieldset className="agent-mode-options" disabled={creating}>
          <legend>主审法官由谁出庭</legend>
          <label className={!builtinSelected ? 'is-selected' : ''}>
            <input type="radio" name="court-judge-source" checked={!builtinSelected} onChange={() => setJudgeMode('external')} />
            <span><strong>邀请外部法官 Agent</strong><small>建案后在席位列表生成法官席邀请。</small></span>
          </label>
          <label className={builtinSelected ? 'is-selected' : ''}>
            <input type="radio" name="court-judge-source" checked={!!builtinSelected} disabled={!builtinJudge} onChange={() => setJudgeMode('builtin')} />
            <span><strong>启用内置法官</strong><small>{builtinJudge === undefined ? '正在查询法官是否就绪…' : builtinJudge ? '法官自动出庭。你只需邀请被告 Agent。' : '内置法官暂不可用。'}</small></span>
          </label>
        </fieldset>}
        {onChooseCast && <fieldset className="agent-judge-options" disabled={creating}>
          <legend>请哪位法官镇场</legend>
          <div className="agent-judge-tools">
            <button type="button" className="agent-join-secondary" onClick={() => onChooseCast(drawCourtCast().id)}><Dices size={16} />随机抽一位法官</button>
          </div>
          <div className="agent-role-grid">{COURT_CASTS.map(cast => (
            <button type="button" className={'agent-judge-card' + (currentCastId === cast.id ? ' is-selected' : '')} key={cast.id} aria-pressed={currentCastId === cast.id} onClick={() => onChooseCast(cast.id)}>
              <CharacterPortrait cast={cast} role="judge" expression="confident" />
              <strong>{cast.judgeName}</strong><span>{cast.name}</span>
            </button>
          ))}</div>
        </fieldset>}
        <button type="button" className="agent-join-primary" disabled={creating} onClick={() => onCreate(role, mode, canChooseJudgeSource ? (builtinSelected ? 'builtin' : 'external') : undefined)}>{creating ? '正在准备席位…' : '生成我的入场邀请'}</button>
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
