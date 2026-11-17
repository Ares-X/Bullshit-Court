import React from 'react';
import { Check, RotateCcw, Vote } from 'lucide-react';
import type { CaseData } from '../types';
import { Modal } from './Modal';

export interface JuryTally { plaintiff: number; defendant: number; }
interface JuryVoteModalProps {
  isOpen: boolean; onClose: () => void; currentCase: CaseData;
  localVote?: 'plaintiff' | 'defendant'; tally: JuryTally;
  participants: number; guest: boolean; multiplayer: boolean;
  onVote: (side: 'plaintiff' | 'defendant') => void;
  onFinalize: () => void; onRestartVote: () => void;
}
export function JuryVoteModal({ isOpen, onClose, currentCase, localVote, tally, participants, guest, multiplayer, onVote, onFinalize, onRestartVote }: JuryVoteModalProps) {
  const total = tally.plaintiff + tally.defendant;
  const tied = total > 0 && tally.plaintiff === tally.defendant;
  return <Modal isOpen={isOpen} onClose={onClose} title="陪审团，请投票" className="jury-modal">
    <div className="jury-ballot">
      <div className="jury-ballot__icon"><Vote size={30} /></div>
      <h3>控辩双方已杀得头破血流，你力挺谁？</h3>
      <p>将生杀大权交由台下唯一的真人陪审官！你的这一票将决定最终命运！</p>
      <div className="jury-options">
        <button className="jury-option jury-option--plaintiff" onClick={() => onVote('plaintiff')} disabled={!!localVote} aria-pressed={localVote === 'plaintiff'}><span>支持原告</span><strong>{currentCase.plaintiffName}</strong><p>原告占理！此等离谱行为必须当庭严惩！</p><small>{localVote === 'plaintiff' ? <><Check size={16} />已投给原告</> : '投原告一票 →'}</small></button>
        <button className="jury-option jury-option--defendant" onClick={() => onVote('defendant')} disabled={!!localVote} aria-pressed={localVote === 'defendant'}><span>支持被告</span><strong>{currentCase.defendantName}</strong><p>被告无辜！捍卫凡人摸鱼犯傻的合法自由！</p><small>{localVote === 'defendant' ? <><Check size={16} />已投给被告</> : '投被告一票 →'}</small></button>
      </div>
      {multiplayer && <div className="jury-tally" role="status">{guest ? <p>{localVote ? '你的票已送出，等待陪审团结果与法官宣判。' : '与其他真人陪审员共同投票。'}</p> : <><p>原告 {tally.plaintiff} 票 · 被告 {tally.defendant} 票</p><p>已收 {total} / {participants} 票。可等所有人投完，也可在已有多数时结束本轮。</p>{tied ? <><p>本轮平票，需要重新表决。</p><button className="court-button" onClick={onRestartVote}><RotateCcw size={15} />平票重投</button></> : <button className="court-button court-button--primary" onClick={onFinalize} disabled={total === 0}>结束投票，交法官宣判</button>}</>}</div>}
      <p className="jury-ballot__notice">✨ 最高破事法庭全权由你裁断，落槌无悔！</p>
    </div>
  </Modal>;
}