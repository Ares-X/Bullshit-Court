import { useEffect, useRef, useState } from 'react';
import type { CaseData, CourtRole } from '../types';
import type { GameCard } from '../types/platform';
import { PRESET_CASES } from '../data/presetCases';
import { COURT_CASTS } from '../data/courtCasts';
import { platformClient } from '../utils/platformClient';
import { CharacterPortrait } from './CharacterPortrait';
import { CourtLobby } from './CourtLobby';

export interface PlatformHomeProps {
  games: GameCard[];
  loading?: boolean;
  error?: string;
  onRefresh: () => void;
  onCreate: (caseData?: CaseData) => void;
  onWatch: (gameId: string) => void;
  onJoin: (gameId: string, role: CourtRole) => void;
  onLibrary: () => void;
}
export function PlatformHome({ games, loading, error, onRefresh, onCreate, onWatch, onJoin, onLibrary }: PlatformHomeProps) {
  const [recent, setRecent] = useState<GameCard[]>([]);
  const [archiveError, setArchiveError] = useState(false);
  const lobby = useRef<HTMLElement>(null);
  const [caseIndex, setCaseIndex] = useState(0);
  const selected = PRESET_CASES[caseIndex];
  const cast = COURT_CASTS[0];
  useEffect(() => {
    const controller = new AbortController();
    void platformClient.judgments('', undefined, 3, controller.signal).then(result => setRecent(result.games.filter(game => game.status === 'completed' || game.status === 'unresolved'))).catch(() => { if (!controller.signal.aborted) setArchiveError(true); });
    return () => controller.abort();
  }, []);
  const activeGames = games.filter(game => game.status !== 'completed' && game.status !== 'unresolved');
  const jump = () => lobby.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return <div className="platform-home">
    <section className="platform-hero" aria-labelledby="platform-title">
      <div className="platform-hero-copy">
        <h1 id="platform-title">这事儿，<br /><em>法庭上见。</em></h1>
        <p className="platform-hero-intro">已读不回、火锅煮成土豆泥。<br />你来起诉，找朋友应诉，或者让法庭替他辩。</p>
        <div className="platform-actions">
          <button className="platform-button platform-button--primary" onClick={() => onCreate()}>我要起诉 <span aria-hidden="true">↗</span></button>
          <button className="platform-button" onClick={jump}>搬凳旁听</button>
        </div>
      </div>
      <div className="platform-pixel-court" aria-label="三席开庭角色展示"><span className="platform-court-sign">COURT IS IN SESSION</span><div className="platform-hero-cast">{(['plaintiff', 'judge', 'defendant'] as const).map(role => <div className={`platform-hero-character platform-hero-character--${role}`} key={role}><span className="platform-speech">{role === 'plaintiff' ? '异议！这合理吗？' : role === 'judge' ? '肃静！逐个离谱。' : '我有我的道理！'}</span><CharacterPortrait cast={cast} role={role} expression={role === 'judge' ? 'confident' : role === 'plaintiff' ? 'speaking' : 'shocked'} /><strong>{role === 'plaintiff' ? '原告席' : role === 'judge' ? '破事大法官' : '被告席'}</strong></div>)}</div><div className="platform-court-desk">无聊小事 · 严肃胡闹 <span>OBJECTION!</span></div></div>
    </section>
    <section className="platform-section platform-cases" aria-labelledby="platform-cases-title"><header className="platform-section-heading"><div><h2 id="platform-cases-title">现成案子</h2></div><button className="platform-text-button" onClick={() => onCreate()}>自己写一桩 ↗</button></header><div className="platform-case-picker"><div className="platform-case-options" aria-label="待立案题材">{PRESET_CASES.slice(0, 6).map((item, index) => <button key={item.id} aria-pressed={caseIndex === index} onClick={() => setCaseIndex(index)}>{item.title}</button>)}</div><article className="platform-case-preview"><h3>{selected.title}</h3><p>{selected.summary}</p><div className="platform-case-clash">{selected.coreClash}</div><button className="platform-button platform-button--primary" onClick={() => onCreate(selected)}>就审这件事 ↗</button></article></div></section>
    <section className="platform-section platform-live" ref={lobby} aria-label="公开庭审">
      <CourtLobby games={activeGames} loading={loading} error={error} onRefresh={onRefresh} onWatch={onWatch} onJoin={onJoin} />
    </section>
    <section className="platform-section" aria-labelledby="platform-archive-title"><header className="platform-section-heading"><div><h2 id="platform-archive-title">公开判决</h2></div><button className="platform-text-button" onClick={onLibrary}>翻翻全部案卷 ↗</button></header><div className="platform-recent-judgments">{recent.length ? recent.map(game => <article key={game.id} className="platform-judgment-card"><span className="platform-tag">{game.status === 'unresolved' ? '陪审未决' : '已结案'} · {game.jury.total} 票</span><h3>{game.title}</h3><blockquote>{game.ruling?.quote || (game.status === 'unresolved' ? '本案未决。' : game.ruling?.result || '打开案卷查看判词。')}</blockquote><button className="platform-text-button" onClick={() => onWatch(game.id)}>打开案卷 →</button></article>) : <div className="platform-archive-empty"><span aria-hidden="true">▤</span><div><h3>{archiveError ? '案卷柜暂时打不开' : '还没有公开判决'}</h3><p>{archiveError ? '稍后打开判决库重试。你仍可选择题材开庭。' : '公开庭审结束后，判词会收录在这里。'}</p></div><button className="platform-text-button" onClick={onLibrary}>{archiveError ? '打开判决库重试 →' : '看看判决库 →'}</button></div>}</div></section>
  </div>;
}
