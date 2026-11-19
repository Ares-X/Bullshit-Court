import { useEffect, useRef } from 'react';
import type { PublicGame, JuryWinner } from '../types/platform';
import { Modal } from './Modal';

interface PlatformJuryModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: PublicGame;
  localVote?: JuryWinner;
  voting?: boolean;
  error?: string;
  onVote: (side: JuryWinner) => void;
}

export function PlatformJuryModal({ isOpen, onClose, game, localVote, voting = false, error, onVote }: PlatformJuryModalProps) {
  const submitting = useRef(false);
  useEffect(() => { if (!voting) submitting.current = false; }, [voting, error, game.revision]);
  useEffect(() => { submitting.current = false; }, [game.id]);
  const caseData = game.session.caseData;
  const completed = game.status === 'completed';
  const unresolved = game.status === 'unresolved';
  const canVote = game.status === 'waiting-jury' && game.jury.outcome === 'pending' && !localVote && !voting;
  const ruling = completed ? game.session.ruling : undefined;
  const deadline = game.jury.deadlineAt;
  const vote = (side: JuryWinner) => {
    if (!canVote || submitting.current) return;
    submitting.current = true;
    onVote(side);
  };
  const heading = completed ? '本庭已结案' : unresolved ? '陪审结果尚未决出' : game.status === 'waiting-jury' ? game.jury.outcome === 'pending' ? '听完双方，你支持谁？' : '票决已定，等待法官判词'  : '还在开庭，先听双方说完';
  return <Modal isOpen={isOpen} onClose={onClose} title="真人陪审席" description={caseData.title} className="platform-jury-modal">
    <div className="platform-jury-content">
      <h3>{heading}</h3>
      <p>台上 Agent 辩得面红耳赤，这一票必须由真人陪审团来投，任何 Agent 不得代投！</p>
      <div className="platform-jury-options">{(['plaintiff', 'defendant'] as const).map(side => <button type="button" key={side} className={`platform-jury-option platform-jury-option--${side}`} onClick={() => vote(side)} disabled={!canVote} aria-pressed={localVote === side}>
        <span>支持{side === 'plaintiff' ? '原告' : '被告'}</span><strong>{side === 'plaintiff' ? caseData.plaintiffName : caseData.defendantName}</strong><span>{side === 'plaintiff' ? game.jury.plaintiffVotes : game.jury.defendantVotes} 票</span><small>{localVote === side ? '你已投给这一方' : voting ? '正在送出选票…' : canVote ? '投这一票' : '投票未开放或已结束'}</small>
      </button>)}</div>
      <div className="platform-jury-tally" role="status">{!completed && (game.jury.outcome === 'plaintiff' || game.jury.outcome === 'defendant') && <p>陪审已支持{game.jury.outcome === 'plaintiff' ? '原告' : '被告'}，法官判词备妥后自动公开。</p>}<p>已收到 {game.jury.total} 票 · 最少需要 {game.jury.minimumVotes} 票</p>{localVote && <p>你的票已记录。法槌不会因为多点几下就加速落地。</p>}</div>
      {completed && <section className="platform-jury-result"><h4>{game.jury.outcome === 'plaintiff' ? '原告胜出' : game.jury.outcome === 'defendant' ? '被告胜出' : '已结案'}</h4>{ruling && <><p>{ruling.result}</p>{ruling.quote && <blockquote>{ruling.quote}</blockquote>}</>}</section>}
      {unresolved && <p className="platform-jury-unresolved">{game.jury.total < game.jury.minimumVotes ? '陪审票数不足，本庭暂未决出胜方。' : '陪审平票，本庭暂未决出胜方。'}投票已结束，留待大家回看这场精彩嘴仗。</p>}
      <div className="platform-jury-rules"><p>每位现场陪审员（每个浏览器）限投一票，神圣公正。</p><p>{game.mode === 'practice' ? '陪练局：第一张有效陪审票决定胜方。' : `公开庭：至少收到 ${game.jury.minimumVotes} 票且双方不平票时收束。若到 24 小时截止仍票数不足或平票，就保留未决结果。`}</p>{deadline !== undefined && <p>陪审截止：<time dateTime={new Date(deadline).toISOString()}>{new Date(deadline).toLocaleString('zh-CN', { hour12: false })}</time>（本地时间）</p>}<p>{completed ? '裁决已公开。' : game.verdict.prepared ? '法官已备好两份条件判词，陪审结果确定后才公开对应的一份。' : '法官还在准备条件判词。'}</p></div>
      {error && <p className="platform-jury-error" role="alert">{error}</p>}
      <p className="platform-jury-notice">✨ 法槌一响，破事退散！严肃搞笑，判决请勿用于真实诉讼。</p>
    </div>
  </Modal>;
}
