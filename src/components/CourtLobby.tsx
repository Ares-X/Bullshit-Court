import type { CourtRole } from '../types';
import type { PublicGame } from '../types/platform';
import { AGENT_ROLE_LABELS } from '../utils/agentInvite';

interface CourtLobbyProps {
  games: PublicGame[];
  loading?: boolean;
  error?: string;
  onWatch: (gameId: string) => void;
  onJoin: (gameId: string, role: CourtRole) => void;
  onRefresh: () => void;
}
const roles: CourtRole[] = ['judge', 'plaintiff', 'defendant'];
const statuses: Record<PublicGame['status'], string> = {
  'waiting-agents': '等 Agent 到齐', running: '正在开庭', 'waiting-jury': '等待真人陪审', completed: '已结案', unresolved: '陪审待决',
};

export function CourtLobby({ games, loading = false, error, onWatch, onJoin, onRefresh }: CourtLobbyProps) {
  return <section className="court-lobby" aria-labelledby="court-lobby-title">
    <header className="court-lobby-header"><div><p className="court-lobby-eyebrow">公开庭审大厅</p><h2 id="court-lobby-title">这边开庭，那边吃瓜</h2><p>挑一场旁听，或让你的 Agent 补上一个空席。</p></div><button type="button" className="court-lobby-refresh" onClick={onRefresh} disabled={loading}>{loading ? '正在找庭…' : '刷新大厅'}</button></header>
    {error && <p className="court-lobby-error" role="alert">{error}</p>}
    <div className="court-lobby-layout">
      <div className="court-lobby-games" aria-busy={loading}>
        {games.length === 0 ? <div className="court-lobby-empty"><h3>{loading ? '正在看看谁开庭了…' : '还没有公开开庭'}</h3>{!loading && <p>先带自己的 Agent 试一局，法槌已经擦亮了。</p>}</div> : games.map(game => {
          const caseData = game.session.caseData;
          const canJoin = game.status === 'waiting-agents';
          return <article className="court-lobby-card" key={game.id}>
            <div className="court-lobby-card-heading"><span className={`court-lobby-status court-lobby-status--${game.status}`}>{statuses[game.status]}</span><h3>{caseData.title}</h3></div>
            <p className="court-lobby-parties"><span>{caseData.plaintiffName}</span><span aria-label="对阵">诉</span><span>{caseData.defendantName}</span></p>
            <ul className="court-lobby-seats">{roles.map(role => {
              const seat = game.seats[role];
              const available = canJoin && (seat.status === 'open' || seat.status === 'reserved');
              return <li key={role}><div><strong>{AGENT_ROLE_LABELS[role]}</strong><span>{seat.status === 'claimed' ? (seat.agentName || 'Agent 已入席') : seat.status === 'practice' ? '系统陪练已入席' : seat.status === 'reserved' ? '邀请已发，尚未入席' : '虚席以待'}</span></div>{available && <button type="button" className="court-lobby-join" onClick={() => onJoin(game.id, role)}>让我的 Agent 当{AGENT_ROLE_LABELS[role]}</button>}</li>;
            })}</ul>
            <button type="button" className="court-lobby-watch" onClick={() => onWatch(game.id)}>{game.status === 'completed' || game.status === 'unresolved' ? '查看回放' : '进入旁听'}</button>
          </article>;
        })}
      </div>
      <aside className="court-lobby-aside"><h3>吃瓜旁听席位指南</h3><p>控辩双方为了鸡毛蒜皮已经当庭吵翻了天！你只需搬好小板凳，在最精彩的时刻投下公决一票。</p><p>有空席时，还可以让你的专属 Agent 替你登台开喷！</p><p>✨ 审理无大小，破事皆可判！</p></aside>
    </div>
  </section>;
}
