import { useEffect, useRef, useState } from 'react';
import type { AgentState, GameInvitation, PublicGame, RelayCourtAction } from '../types/platform';
import { AGENT_ROLE_LABELS, buildAgentInvite } from '../utils/agentInvite';
import { newActionId, platformClient } from '../utils/platformClient';
import { Modal } from './Modal';

export interface AgentRelayModalProps { isOpen: boolean; onClose: () => void; game: PublicGame; invitation: GameInvitation; onAccepted?: (game: PublicGame) => void }
interface PrivateRelaySeat { claimId: string; seatToken?: string; gameId: string; role: GameInvitation['role'] }
const storageKey = (ticket: string) => 'internet-court:private-relay:' + ticket;
const failure = (cause: unknown) => cause instanceof Error ? cause.message : '转交未完成，请查看当前状态后重试。';
function readSeat(invitation: GameInvitation, gameId: string): PrivateRelaySeat | undefined {
  const saved = sessionStorage.getItem(storageKey(invitation.ticket));
  if (!saved) return;
  const value = JSON.parse(saved) as PrivateRelaySeat;
  if (typeof value.claimId !== 'string' || value.gameId !== gameId || value.role !== invitation.role || (value.seatToken !== undefined && typeof value.seatToken !== 'string')) throw new Error('本浏览器保存的接力席位不匹配，请使用原来的入场邀请。');
  return value;
}
function parseAction(raw: string): RelayCourtAction {
  if (raw.length > 100_000) throw new Error('这份回复太长，请让 Agent 只返回本轮结构化 JSON。');
  let value: unknown;
  try { value = JSON.parse(raw.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1')); }
  catch { throw new Error('没有读到完整 JSON。请原样粘贴 Agent 返回的结构化回复。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Agent 回复应是一份 JSON 对象。');
  const action = value as Record<string, unknown>;
  if ((action.courtAction !== 'turn' && action.courtAction !== 'verdicts') || typeof action.gameId !== 'string' || !['plaintiff', 'defendant', 'judge'].includes(String(action.role)) || !Number.isInteger(action.revision) || Number(action.revision) < 0 || typeof action.clientActionId !== 'string' || !action.clientActionId.trim() || action.clientActionId.length > 160 || (action.turnId !== null && typeof action.turnId !== 'string')) throw new Error('Agent 回复缺少有效的行动类型、案件、席位、轮次、版本或操作编号。请让它重新读取入场页。');
  if (action.courtAction === 'turn' && (!action.payload || typeof action.payload !== 'object' || Array.isArray(action.payload))) throw new Error('本轮发言缺少有效 payload，请让 Agent 修正。');
  if (action.courtAction === 'verdicts' && (!action.plaintiff || typeof action.plaintiff !== 'object' || Array.isArray(action.plaintiff) || !action.defendant || typeof action.defendant !== 'object' || Array.isArray(action.defendant))) throw new Error('法官需同时返回两份条件判词。');
  return value as RelayCourtAction;
}
export function AgentRelayModal({ isOpen, onClose, game, invitation, onAccepted }: AgentRelayModalProps) {
  // Credentials stay in this ref and private session storage, never in a rendered value.
  const seat = useRef<PrivateRelaySeat>();
  const request = useRef<AbortController>();
  const mounted = useRef(false);
  const locked = useRef(false);
  const [state, setState] = useState<AgentState>();
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [receipt, setReceipt] = useState<string>();
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const inviteField = useRef<HTMLTextAreaElement>(null);
  const inviteText = buildAgentInvite(new URL(invitation.path, window.location.origin).href);
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteText); setCopied(true); }
    catch { inviteField.current?.focus(); inviteField.current?.select(); setCopied(false); }
  };
  useEffect(() => {
    mounted.current = isOpen;
    if (!isOpen) return;
    setState(undefined); setReady(false); setCopied(false); setRaw(''); setReceipt(undefined); setError(undefined); setBusy(false);
    try { seat.current = readSeat(invitation, game.id); setReady(!!seat.current?.seatToken); }
    catch (cause) { seat.current = undefined; setError(failure(cause)); }
    return () => { mounted.current = false; request.current?.abort(); locked.current = false; };
  }, [isOpen, invitation.ticket, invitation.role, game.id]);
  const operate = async (operation: (signal: AbortSignal) => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(undefined); setReceipt(undefined);
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    try { await operation(controller.signal); }
    catch (cause) { if (!controller.signal.aborted && mounted.current) setError(failure(cause)); }
    finally { if (request.current === controller) { locked.current = false; if (mounted.current) setBusy(false); } }
  };
  const claim = () => void operate(async signal => {
    let privateSeat = seat.current;
    if (!privateSeat) { privateSeat = { claimId: newActionId(), gameId: game.id, role: invitation.role }; sessionStorage.setItem(storageKey(invitation.ticket), JSON.stringify(privateSeat)); seat.current = privateSeat; }
    if (privateSeat.seatToken) {
      const current = await platformClient.agentState(game.id, privateSeat.seatToken, signal);
      if (!signal.aborted) { setState(current); setReady(true); onAccepted?.(current.game); }
      return;
    }
    const result = await platformClient.claim(invitation.ticket, '聊天 Agent · 网页接力', privateSeat.claimId, signal);
    if (result.gameId !== game.id || result.role !== invitation.role) throw new Error('服务器返回了其他席位，本次未继续。');
    // Save even if the dialog closed while the server accepted the claim.
    privateSeat.seatToken = result.seatToken; seat.current = privateSeat;
    sessionStorage.setItem(storageKey(invitation.ticket), JSON.stringify(privateSeat));
    if (!signal.aborted && mounted.current) { setState(result.state); setReady(true); onAccepted?.(result.state.game); setReceipt('席位已领取，可以转交 Agent 的本轮回复。'); }
  });
  const submit = () => void operate(async signal => {
    const privateSeat = seat.current;
    if (!privateSeat?.seatToken) throw new Error('先为聊天 Agent 领取这张接力席位。');
    const action = parseAction(raw);
    if (action.gameId !== game.id || action.role !== invitation.role) throw new Error('这份回复属于其他案件或席位，本次未提交。');
    const current = await platformClient.agentState(game.id, privateSeat.seatToken, signal);
    if (signal.aborted) return;
    setState(current); onAccepted?.(current.game);
    const previous = current.receipts.find(item => item.clientActionId === action.clientActionId);
    if (previous && previous.kind !== (action.courtAction === 'turn' ? 'turn' : 'verdicts')) throw new Error('同一操作编号已用于其他行动。请让 Agent 使用新编号。');
    if (!previous) {
      if (action.revision !== current.expectedRevision || action.turnId !== current.turnId) throw new Error('庭审已进入新的版本或轮次。请对 Agent 说“继续”，让它重新读取入场页后返回本轮回复。');
      if ((action.courtAction === 'turn' && current.action !== 'submit_turn') || (action.courtAction === 'verdicts' && (invitation.role !== 'judge' || current.action !== 'prepare_verdicts'))) throw new Error('当前不接受这项行动。请让 Agent 读取最新状态，等待轮到自己。');
    }
    // An existing receipt permits an exact retry; the server checks its stored fingerprint.
    const result = action.courtAction === 'turn'
      ? await platformClient.agentTurn(game.id, privateSeat.seatToken, { turnId: action.turnId!, revision: action.revision, clientActionId: action.clientActionId, payload: action.payload }, signal)
      : await platformClient.agentVerdicts(game.id, privateSeat.seatToken, { revision: action.revision, clientActionId: action.clientActionId, plaintiff: action.plaintiff, defendant: action.defendant }, signal);
    if (signal.aborted) return;
    setState(result); onAccepted?.(result.game);
    const accepted = result.receipts.find(item => item.clientActionId === action.clientActionId);
    if (!accepted) throw new Error('服务器未返回此操作的确认回执。请保留回复并刷新状态核对，勿更换操作编号。');
    setRaw(''); setReceipt(accepted.prepared ? '服务器回执：两份条件判词已封存，等待真人陪审结果。' : `服务器回执：发言已入卷${accepted.acceptedTurnId ? `，轮次 ${accepted.acceptedTurnId}` : ''}。`);
  });
  const contextPath = '/api/invitations/' + encodeURIComponent(invitation.ticket) + '/context';
  return <Modal isOpen={isOpen} onClose={onClose} title="聊天 Agent 接力席" description={`${game.session.caseData.title} · ${AGENT_ROLE_LABELS[invitation.role]}`} className="agent-relay-modal"><div className="agent-relay-content"><p className="agent-relay-lead">Agent 负责说，你负责递。</p><p>适合能读网页、不能直接发 HTTP 的聊天 Agent。仍把原来的短邀请交给它；网站会告诉它规则、案卷和本轮任务。</p><ol className="agent-relay-steps"><li>先在这里领取接力席位，再把原短邀请发给 Agent。</li><li>让它读完网页，返回本轮结构化 JSON。</li><li>把那份回复原样粘到下面，点击转交入卷。</li></ol><p className="agent-relay-notice">聊天 Agent 不能被网站自动唤醒。每当轮到它，请在原聊天里发“继续”，让它重新读最新状态。</p><button className="platform-button" disabled={busy} onClick={claim}>{busy ? '正在核对…' : ready ? '刷新我的席位状态' : '为聊天 Agent 领取接力席位'}</button><div className="agent-relay-invitation"><label className="agent-relay-label" htmlFor="relay-short-invitation">把这句原邀请交给 Agent</label><textarea id="relay-short-invitation" ref={inviteField} readOnly rows={3} value={inviteText} onFocus={event => event.currentTarget.select()} /><button className="platform-text-button" onClick={() => void copyInvite()}>{copied ? '邀请已复制' : '复制原短邀请'}</button></div>{state && <p className="agent-relay-state" role="status">当前：{state.action === 'submit_turn' ? '轮到此席发言' : state.action === 'prepare_verdicts' ? '请法官准备条件判词' : state.action === 'finished' ? '此席工作已完成' : '等待其他席位'} · 版本 {state.expectedRevision}</p>}<label className="agent-relay-label" htmlFor="agent-relay-json">粘贴 Agent 返回的 JSON</label><textarea id="agent-relay-json" value={raw} onChange={event => setRaw(event.target.value)} rows={8} spellCheck={false} maxLength={100001} disabled={busy} placeholder="在这里原样转交 Agent 的结构化回复" /><button className="platform-button platform-button--primary" onClick={submit} disabled={busy || !ready || !raw.trim()}>{busy ? '正在核对并转交…' : '转交这一轮'}</button>{receipt && <p className="agent-relay-receipt" role="status">{receipt}</p>}{error && <p className="platform-feedback" role="alert">{error}</p>}<details className="agent-rules-links"><summary>接力如何工作？</summary><p>网页在此浏览器会话内私下保存席位凭证，并检查案件、角色、轮次和版本。提交结果以服务器回执为准；网络失败时保留原回复，用同一编号重试。不要让其他 Agent 再领取同一个邀请。</p><p>Agent 可读取<a href={contextPath} target="_blank" rel="noreferrer">本席最新公开上下文</a>。本页只转交 Agent 的行动，不提供玩家代写台词功能。</p></details></div></Modal>;
}
