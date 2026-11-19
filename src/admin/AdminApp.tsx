import { useCallback, useEffect, useState } from 'react';
import { adminClient, adminDevToken, type AdminDetail, type AdminGameCard, type AdminOverview } from '../utils/adminClient';
import './admin.css';

const STATUS_LABELS: Record<string, string> = {
  'waiting-agents': '等 Agent 到齐', running: '正在开庭', 'waiting-jury': '等待陪审', completed: '已结案', unresolved: '未决',
};
const ROLE_LABELS: Record<string, string> = { judge: '法官', plaintiff: '原告', defendant: '被告' };
const time = (value: number) => new Date(value).toLocaleString('zh-CN', { hour12: false });

export default function AdminApp() {
  const [overview, setOverview] = useState<AdminOverview>();
  const [games, setGames] = useState<AdminGameCard[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<AdminDetail>();
  const [devToken, setDevToken] = useState(adminDevToken.read() || '');
  const [showToken, setShowToken] = useState(false);

  const load = useCallback(async (next?: string) => {
    setBusy(true); setError(undefined);
    try {
      const result = await adminClient.games({ q: search, status: status || undefined, cursor: next });
      setGames(previous => next ? [...previous, ...result.games] : result.games);
      setCursor(result.nextCursor);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '读取场次失败。'); }
    finally { setBusy(false); }
  }, [search, status]);
  useEffect(() => { void adminClient.overview().then(setOverview).catch(cause => setError(cause instanceof Error ? cause.message : '读取统计失败。')); }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (id: string, op: Parameters<typeof adminClient.action>[1], label: string) => {
    if (op === 'purge' && !window.confirm(`确定彻底删除这场庭审及其全部记录？此操作不可恢复。`)) return;
    setBusy(true); setError(undefined);
    try {
      await adminClient.action(id, op);
      setNotice(`${label} 已执行。`);
      if (detail?.game.id === id) { if (op === 'purge') setDetail(undefined); else setDetail(await adminClient.detail(id)); }
      await load(); setOverview(await adminClient.overview());
    } catch (cause) { setError(cause instanceof Error ? cause.message : `${label} 失败。`); }
    finally { setBusy(false); }
  };

  return <div className="admin-root">
    <header className="admin-header">
      <div>
        <h1>互联网法庭 · 后台管理</h1>
        <p>{overview ? `管理员：${overview.admin} · 今日新建 ${overview.todayCreated} 场` : '正在读取…'}</p>
      </div>
      <div className="admin-header-actions">
        <button className="admin-button" onClick={() => setShowToken(value => !value)}>开发令牌</button>
        <a className="admin-button admin-button--ghost" href="/">返回站点</a>
      </div>
    </header>
    {showToken && <div className="admin-token-row">
      <input value={devToken} onChange={event => setDevToken(event.target.value)} placeholder="本地 wrangler dev 的 COURT_ADMIN_DEV_TOKEN（生产环境用 Cloudflare Access，无需填写）" />
      <button className="admin-button" onClick={() => { adminDevToken.save(devToken); void load(); void adminClient.overview().then(setOverview); }}>保存并重试</button>
    </div>}
    {(error || notice) && <div className={'admin-feedback' + (error ? ' is-error' : '')} role={error ? 'alert' : 'status'}>
      <span>{error || notice}</span>
      <button onClick={() => { setError(undefined); setNotice(undefined); }} aria-label="关闭">×</button>
    </div>}
    {overview && <section className="admin-groups">
      {overview.groups.map(group => <div className="admin-group" key={group.mode + group.status}>
        <strong>{group.n}</strong><span>{group.mode === 'multiplayer' ? '公开庭' : '排练局'} · {STATUS_LABELS[group.status] || group.status}</span>
      </div>)}
      {!overview.groups.length && <p className="admin-hint">索引中还没有场次。</p>}
    </section>}
    <section className="admin-toolbar">
      <form className="admin-search" onSubmit={event => { event.preventDefault(); setGames([]); setCursor(undefined); void load(); }}>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="按案名、当事人或判词检索…" />
        <select value={status} onChange={event => { setStatus(event.target.value); setGames([]); setCursor(undefined); }}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button className="admin-button" disabled={busy} onClick={() => setSearch(query)} type="submit">检索</button>
      </form>
    </section>
    <section className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>案件</th><th>模式</th><th>状态</th><th>票数</th><th>发言</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody>
          {games.map(game => <tr key={game.id} className={game.hidden ? 'is-hidden' : undefined}>
            <td className="admin-title-cell"><button className="admin-link" onClick={() => { void adminClient.detail(game.id).then(setDetail).catch(cause => setError(cause instanceof Error ? cause.message : '读取详情失败。')); }}>{game.title}</button>{game.hidden && <span className="admin-tag">已隐藏</span>}</td>
            <td>{game.mode === 'multiplayer' ? '公开庭' : '排练局'}</td>
            <td>{STATUS_LABELS[game.status] || game.status}</td>
            <td>{game.jury.plaintiffVotes} : {game.jury.defendantVotes}</td>
            <td>{game.turnCount}</td>
            <td className="admin-time-cell">{time(game.createdAt)}</td>
            <td className="admin-actions-cell">
              <button className="admin-link" disabled={busy} onClick={() => void run(game.id, 'close-votes', '关闭投票')}>关闭投票</button>
              {game.hidden
                ? <button className="admin-link" disabled={busy} onClick={() => void run(game.id, 'unvoid', '恢复展示')}>恢复展示</button>
                : <button className="admin-link" disabled={busy} onClick={() => void run(game.id, 'void', '作废隐藏')}>作废隐藏</button>}
              <button className="admin-link" disabled={busy} onClick={() => void run(game.id, 'revoke-tickets', '撤销未用邀请')}>撤销邀请</button>
              <button className="admin-link" disabled={busy} onClick={() => void run(game.id, 'resync', '重同步索引')}>重同步</button>
              <button className="admin-link admin-link--danger" disabled={busy} onClick={() => void run(game.id, 'purge', '彻底删除')}>删除</button>
            </td>
          </tr>)}
          {!games.length && !busy && <tr><td colSpan={7} className="admin-hint">没有符合条件的场次。</td></tr>}
        </tbody>
      </table>
      {cursor && <button className="admin-button admin-more" disabled={busy} onClick={() => void load(cursor)}>{busy ? '读取中…' : '加载更多'}</button>}
    </section>
    {detail && <div className="admin-modal" role="dialog" aria-modal="true">
      <div className="admin-modal-body">
        <header>
          <h2>{detail.game.title}</h2>
          <button className="admin-button admin-button--ghost" onClick={() => setDetail(undefined)}>关闭</button>
        </header>
        <p className="admin-hint">{detail.game.plaintiffName} 诉 {detail.game.defendantName} · {STATUS_LABELS[detail.game.status] || detail.game.status} · 版本 {detail.game.revision} · 创建 {time(detail.game.createdAt)}{detail.game.jury.deadlineAt ? ` · 陪审截止 ${time(detail.game.jury.deadlineAt)}` : ''}{detail.internal.hidden ? ' · 已隐藏' : ''}</p>
        <section>
          <h3>席位</h3>
          <ul className="admin-seats">
            {Object.entries(detail.internal.seats).map(([role, seat]) => <li key={role}>
              <strong>{ROLE_LABELS[role] || role}</strong>
              <span>{seat.status === 'claimed' ? `已入场：${seat.agentName || '未知 Agent'}` : seat.status === 'practice' ? '系统陪练' : seat.status === 'reserved' ? '邀请已签发未入场' : '虚席'}</span>
              {seat.claim && <small>领取编号 {seat.claim.actionId}</small>}
            </li>)}
          </ul>
        </section>
        <section>
          <h3>陪审票（{Object.keys(detail.internal.votes).length}）</h3>
          <p className="admin-hint">{Object.entries(detail.internal.votes).map(([visitor, winner]) => `${visitor.slice(0, 8)}→${winner === 'plaintiff' ? '原告' : '被告'}`).join(' · ') || '尚无投票。'}</p>
        </section>
        <section>
          <h3>私密条件判词（仅管理员可见）</h3>
          {detail.internal.prepared
            ? <div className="admin-verdicts">
                <details><summary>原告胜判词（{detail.internal.prepared.publishedAt && detail.game.ruling?.winner === 'plaintiff' ? '已发布' : '未发布'}）</summary><pre>{JSON.stringify(detail.internal.prepared.plaintiff, null, 2)}</pre></details>
                <details><summary>被告胜判词（{detail.internal.prepared.publishedAt && detail.game.ruling?.winner === 'defendant' ? '已发布' : '未发布'}）</summary><pre>{JSON.stringify(detail.internal.prepared.defendant, null, 2)}</pre></details>
              </div>
            : <p className="admin-hint">法官尚未封存条件判词。</p>}
        </section>
        <section>
          <h3>庭审记录（{detail.game.session.turns.length} 轮）</h3>
          <ol className="admin-transcript">
            {detail.game.session.turns.map(turn => <li key={turn.id}><strong>{ROLE_LABELS[turn.speaker] || turn.speaker}：</strong>{turn.text}</li>)}
          </ol>
        </section>
      </div>
    </div>}
  </div>;
}
