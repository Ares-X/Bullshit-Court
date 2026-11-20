import { useEffect, useRef } from 'react';
import type { PublicGame, JuryWinner } from '../types/platform';
import { Modal } from './Modal';

interface PlatformJuryModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: PublicGame;
  localVote?: JuryWinner;
  seated?: boolean;
  voting?: boolean;
  error?: string;
  onVote: (side: JuryWinner) => void;
}

export function PlatformJuryModal({ isOpen, onClose, game, localVote, seated, voting = false, error, onVote }: PlatformJuryModalProps) {
  const submitting = useRef(false);
  useEffect(() => { if (!voting) submitting.current = false; }, [voting, error, game.revision]);
  useEffect(() => { submitting.current = false; }, [game.id]);
  const caseData = game.session.caseData;
  const completed = game.status === 'completed';
  const unresolved = game.status === 'unresolved';
  const juryWinner = game.jury.outcome === 'plaintiff' ? '原告' : game.jury.outcome === 'defendant' ? '被告' : undefined;
  const juryOpen = game.status === 'waiting-jury' && game.jury.outcome === 'pending';
  const draw = game.jury.outcome === 'draw';
  const verdictPending = !completed && (!!juryWinner || draw);
  const canVote = juryOpen && seated !== false && !localVote && !voting;
  const ruling = completed ? game.session.ruling : undefined;
  const deadline = game.jury.deadlineAt;
  const vote = (side: JuryWinner) => {
    if (!canVote || submitting.current) return;
    submitting.current = true;
    onVote(side);
  };
  const heading = completed ? '本庭已结案' : unresolved ? '陪审结果未决' : verdictPending ? '票决已定，等待法官宣判' : juryOpen ? '听完双方，你支持谁？' : '庭审仍在进行';
  return <Modal isOpen={isOpen} onClose={onClose} title={game.party ? '当事人投票' : '真人陪审席'} description={caseData.title} className="platform-jury-modal">
    <div className="platform-jury-content">
      <h3>{heading}</h3>
      {juryOpen && <p>{seated === false ? (game.party ? '当事人正在投票。' : '入席的陪审员正在投票。') : '每人一票。'}</p>}
      <div className="platform-jury-options">{(['plaintiff', 'defendant'] as const).map(side => <button type="button" key={side} className={`platform-jury-option platform-jury-option--${side}`} onClick={() => vote(side)} disabled={!canVote} aria-pressed={localVote === side}>
        <span>支持{side === 'plaintiff' ? '原告' : '被告'}</span><strong>{side === 'plaintiff' ? caseData.plaintiffName : caseData.defendantName}</strong><span>{side === 'plaintiff' ? game.jury.plaintiffVotes : game.jury.defendantVotes} 票</span><small>{localVote === side ? '你已投给这一方' : voting ? '正在送出选票…' : canVote ? '投这一票' : (verdictPending || completed || unresolved) ? '投票已结束' : '暂不可投票'}</small>
      </button>)}</div>
      <div className="platform-jury-tally" role="status">
        {verdictPending && <p>{draw ? '双方各得一票。' : `${juryWinner}得票更多。`}</p>}
        <p>已收到 {game.jury.total} 票 · {game.party ? `共 ${game.jury.minimumVotes} 票` : `最少需要 ${game.jury.minimumVotes} 票`}</p>
      </div>
      {completed && <section className="platform-jury-result"><h4>{game.jury.outcome === 'plaintiff' ? '原告胜出' : game.jury.outcome === 'defendant' ? '被告胜出' : draw ? '双方平票' : '已结案'}</h4>{ruling && <><p>{ruling.result}</p>{ruling.quote && <blockquote>{ruling.quote}</blockquote>}</>}</section>}
      {unresolved && <p className="platform-jury-unresolved">{game.jury.total < game.jury.minimumVotes ? '陪审票数不足，本庭暂未决出胜方。' : '陪审平票，本庭暂未决出胜方。'}投票已结束，留待大家回看这场精彩嘴仗。</p>}
      {juryOpen && <div className="platform-jury-rules">
        <p>{game.party ? (game.party.defendant === 'friend' ? '双方各投一票，平票也会宣判。' : '你的这一票决定结果。') : game.mode === 'practice' ? '陪练局的第一张有效票决定胜方。' : `公开庭收到至少 ${game.jury.minimumVotes} 票且双方票数不同时结束投票。截止时票数不足或平票，结果记为未决。`}</p>
        {deadline !== undefined && <p>陪审截止时间 <time dateTime={new Date(deadline).toISOString()}>{new Date(deadline).toLocaleString('zh-CN', { hour12: false })}</time></p>}
      </div>}
      {error && <p className="platform-jury-error" role="alert">{error}</p>}
    </div>
  </Modal>;
}
