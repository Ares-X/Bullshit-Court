import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { GameCard } from '../types/platform';
import { platformClient, publicGamePath } from '../utils/platformClient';
import { Modal } from './Modal';

export interface JudgmentLibraryProps { isOpen: boolean; onClose: () => void; onWatch: (gameId: string) => void }
export function JudgmentLibrary({ isOpen, onClose, onWatch }: JudgmentLibraryProps) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [games, setGames] = useState<GameCard[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const controller = useRef<AbortController>();
  const load = useCallback(async (term: string, next?: string) => {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError(undefined);
    try {
      const result = await platformClient.judgments(term, next, 12, request.signal);
      if (request.signal.aborted) return;
      // Archive visibility is also enforced by the server; never show a live game here.
      const archived = result.games.filter(game => game.status === 'completed' || game.status === 'unresolved');
      setGames(previous => next ? [...previous, ...archived.filter(game => !previous.some(item => item.id === game.id))] : archived);
      setCursor(result.nextCursor);
    } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : '案卷暂未取到，请重试。'); }
    finally { if (!request.signal.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    if (isOpen) { setGames([]); setCursor(undefined); void load(search); }
    return () => controller.current?.abort();
  }, [isOpen, search, load]);
  const submit = (event: FormEvent) => { event.preventDefault(); const term = query.trim(); if (term === search) void load(term); else setSearch(term); };
  return <Modal isOpen={isOpen} onClose={onClose} title="互联网判决库" className="judgment-library-modal"><div className="judgment-library"><form className="judgment-search" onSubmit={submit}><label className="sr-only" htmlFor="judgment-query">搜索公开案卷</label><input id="judgment-query" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder="搜案名、争议或判词…" /><button className="platform-button platform-button--primary" disabled={loading}>搜案卷</button></form><p className="judgment-library-note">收录已经结束的公开庭审。</p>{error && <div className="platform-feedback" role="alert"><p>{error}</p><button onClick={() => void load(search, games.length ? cursor : undefined)}>重试取卷</button></div>}<div className="judgment-results" aria-busy={loading}>{games.map(game => <article className="platform-judgment-card" key={game.id}><div className="judgment-meta"><span className="platform-tag">{game.status === 'completed' ? '已结案' : '陪审未决'}</span><time dateTime={new Date(game.updatedAt).toISOString()}>{new Date(game.updatedAt).toLocaleDateString('zh-CN')}</time></div><h3>{game.title}</h3><p>{game.plaintiffName} 诉 {game.defendantName}</p><blockquote>{game.ruling?.quote || game.ruling?.result || '票数不足或平票，未形成最终判词。'}</blockquote><div className="judgment-card-footer"><span>{game.jury.total} 票 · {game.turnCount} 次发言</span><a className="platform-text-button" href={publicGamePath(game.id)} onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onWatch(game.id); } }}>观庭记录 →</a></div></article>)}</div>{!games.length && !error && <div className="judgment-empty"><h3>{loading ? '正在取卷…' : search ? '这桩破事还没翻到' : '还没有归档的庭审'}</h3><p>{!loading && (search ? '换个关键词，或者清空搜索看看全部案卷。' : '公开庭审结束后，判词会收录在这里。')}</p></div>}{cursor && <button className="platform-button judgment-more" disabled={loading} onClick={() => void load(search, cursor)}>{loading ? '正在取卷…' : '再翻一页'}</button>}</div></Modal>;
}
