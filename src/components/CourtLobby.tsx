import type { CourtRole } from '../types';
import type { GameCard } from '../types/platform';
import { AGENT_ROLE_LABELS } from '../utils/agentInvite';

interface CourtLobbyProps {
  games: GameCard[];
  loading?: boolean;
  error?: string;
  onWatch: (gameId: string, participate?: boolean) => void;
  onJoin: (gameId: string, role: CourtRole) => void;
  onRefresh: () => void;
}
const roles: CourtRole[] = ['judge', 'plaintiff', 'defendant'];
const statuses: Record<GameCard['status'], string> = {
  'waiting-agents': '等人到齐', 'waiting-jurors': '等陪审员入席', running: '正在开庭', 'waiting-jury': '陪审团正在投票', 'waiting-verdict': '等待法官宣判', completed: '已结案', unresolved: '陪审待决',
};

export function CourtLobby({ games, loading = false, error, onWatch, onJoin, onRefresh }: CourtLobbyProps) {
  return <section className="court-lobby" aria-label="公开庭审">
    <header className="court-lobby-header"><h2>公开庭审</h2><button type="button" className="court-lobby-refresh" onClick={onRefresh} disabled={loading}>{loading ? '正在找庭…' : '刷新大厅'}</button></header>
    {error && <p className="court-lobby-error" role="alert">{error}</p>}
    <div className="court-lobby-games" aria-busy={loading}>
        {games.length === 0 ? <div className="court-lobby-empty"><h3>{loading ? '正在看看谁开庭了…' : '还没有公开开庭'}</h3></div> : games.map(game => {
          const canJoinRole = !game.party && game.status === 'waiting-agents';
          const publicParty = game.party?.visibility === 'public';
          const finished = game.status === 'completed' || game.status === 'unresolved';
          const canJoinJury = game.party?.visibility !== 'invite' && game.audience && (game.audience.canJoin ?? (
            game.status === 'waiting-agents' || game.status === 'waiting-jurors' || game.status === 'running'
          ));
          const status = game.status === 'waiting-jury' && game.jury.outcome !== 'pending' ? '等待法官宣判'
            : game.party?.defendant === 'friend' && game.status === 'waiting-jurors' ? '等朋友应诉'
            : statuses[game.status];
          return <article className="court-lobby-card" key={game.id}>
            <div className="court-lobby-card-heading"><span className={`court-lobby-status court-lobby-status--${game.status}`}>{status}</span><h3>{game.title}</h3></div>
            <p className="court-lobby-parties"><span>{game.plaintiffName}</span><span aria-label="对阵">诉</span><span>{game.defendantName}</span></p>
            {!game.party && <ul className="court-lobby-seats">{roles.map(role => {
              const seat = game.seats[role];
              const available = role !== 'judge' && canJoinRole && (seat.status === 'open' || seat.status === 'reserved');
              return <li key={role}><div><strong>{AGENT_ROLE_LABELS[role]}</strong><span>{seat.source === 'builtin' ? (seat.agentName || '内置主审') : seat.status === 'claimed' ? (seat.agentName || 'Agent 已入席') : seat.status === 'practice' ? '系统陪练已入席' : seat.status === 'reserved' ? '邀请已发，尚未入席' : '虚席以待'}</span></div>{available && <button type="button" className="court-lobby-join" onClick={() => onJoin(game.id, role)}>让我的 Agent 当{AGENT_ROLE_LABELS[role]}</button>}</li>;
            })}</ul>}
            {game.audience && !game.party && (canJoinRole || game.status === 'waiting-jurors') && <p>陪审席 {game.audience.seated} / {game.audience.required}</p>}
            {publicParty && game.audience?.publicJurors !== undefined && <p className="court-lobby-jury-count">{game.audience.publicJurors} 人加入陪审团</p>}
            <div className="court-lobby-actions">
              <button type="button" className={canJoinJury ? 'court-lobby-watch court-lobby-watch--secondary' : 'court-lobby-watch'} onClick={() => onWatch(game.id)}>{finished ? '查看回放' : '我要旁听'}</button>
              {canJoinJury && <button type="button" className="court-lobby-watch" onClick={() => onWatch(game.id, true)}>我要参加陪审团</button>}
            </div>
          </article>;
        })}
    </div>
  </section>;
}
