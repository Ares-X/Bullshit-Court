import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Copy, Check, RotateCcw, Scale } from 'lucide-react';
import { toPng } from 'html-to-image';
import type { CourtSession } from '../types';
import { getCourtRoleProfile } from '../utils/courtRuntime';
import { createCaseShareUrl } from '../utils/caseShare';
import { Modal } from './Modal';

interface VerdictModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: CourtSession;
  onStartAppeal?: () => void;
  shareUrl?: string;
  onPlayAgain: () => void;
}
export function VerdictModal({ isOpen, onClose, session, onStartAppeal, onPlayAgain, shareUrl }: VerdictModalProps) {
  const posterRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [manualText, setManualText] = useState('');
  useEffect(() => { setCopied(false); setCopyError(''); setManualText(''); setExportError(''); }, [session.id]);
  const share = useMemo(() => {
    if (!isOpen || !session.ruling) return { url: '', error: '' };
    try { return { url: shareUrl || createCaseShareUrl(session), error: '' }; }
    catch (cause) { return { url: '', error: cause instanceof Error ? cause.message : '无法创建完整案卷链接' }; }
  }, [isOpen, session, shareUrl]);
  const ruling = session.ruling;
  const caseData = session.caseData;
  const judge = getCourtRoleProfile(caseData, 'judge');
  const date = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  const winnerName = ruling?.winner === 'plaintiff' ? `原告 ${caseData.plaintiffName}` : ruling?.winner === 'defendant' ? `被告 ${caseData.defendantName}` : '双方持平';
  const voteName = session.juryVote === 'plaintiff' ? `原告 ${caseData.plaintiffName}` : session.juryVote === 'defendant' ? `被告 ${caseData.defendantName}` : '尚无票决记录';
  const selectedEvidence = session.evidences.filter(item => ruling?.evidenceIds.includes(item.id));
  const download = async () => {
    const node = posterRef.current; if (!node || !ruling || isExporting) return;
    setIsExporting(true); setExportError('');
    try {
      const width = Math.ceil(node.scrollWidth); const height = Math.ceil(node.scrollHeight);
      const dataUrl = await toPng(node, {
        // The document uses system serif fonts. Avoid fetching the page's unrelated web-font atlas.
        skipFonts: true, width, height,
        pixelRatio: Math.min(2, 16_000 / Math.max(width, height)),
        backgroundColor: '#fffaf0',
        style: { fontFamily: 'Georgia, "Songti SC", "SimSun", serif', width: `${width}px`, height: `${height}px`, maxHeight: 'none', maxWidth: 'none', overflow: 'visible', transform: 'none', margin: '0' },
      });
      const link = document.createElement('a');
      link.download = `互联网法庭判决书-${caseData.title.replace(/[\\/:*?"<>|]/g, '-')}.png`;
      link.href = dataUrl; link.click();
    } catch (cause) { setExportError(`图片导出失败：${cause instanceof Error ? cause.message : '浏览器无法生成图片'}。请重试或用系统长截图保存。`); }
    finally { setIsExporting(false); }
  };
  const copyShare = async () => {
    if (!ruling || !share.url) return;
    const text = `【互联网法庭 · 本案判决】\n案号：${caseData.caseNumber}\n案由：${caseData.title}\n原告：${caseData.plaintiffName}\n被告：${caseData.defendantName}\n陪审票决支持：${voteName}\n裁决：${ruling.result}\n理由：\n${ruling.reasons.map((item, i) => `${i + 1}. ${item}`).join('\n')}\n履行事项：\n${ruling.penalty.map((item, i) => `${i + 1}. ${item}`).join('\n')}\n法官 ${judge.name}：${ruling.quote}\n\n完整案卷与续审：${share.url}`;
    setManualText(text);
    try { await navigator.clipboard.writeText(text); setCopied(true); setCopyError(''); }
    catch { setCopied(false); setCopyError('复制失败。下方已备好完整分享文字，可以手动全选复制。'); requestAnimationFrame(() => { fallbackRef.current?.focus(); fallbackRef.current?.select(); }); }
  };
  const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-amber-50 disabled:opacity-50';
  return <Modal isOpen={isOpen} onClose={onClose} title="本案判决书" description="全场真人陪审团公决结果已出，主审法官当庭盖章宣判！" className="court-verdict">
    {!ruling ? <p className="p-6 text-slate-700">本案尚未产生法官裁决。</p> : <>
      <div className="px-5 pt-5 flex flex-wrap gap-2">
        <button className={button} onClick={download} disabled={isExporting}><Download size={16} />{isExporting ? '正在生成完整判决书…' : '保存完整判决书'}</button>
        <button className={button} onClick={copyShare} disabled={!share.url}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? '案卷与判词已复制' : '复制判词与案卷链接'}</button>
      </div>
      {(exportError || copyError || share.error) && <p role="alert" className="mx-5 mt-3 text-sm text-red-700 break-words">{exportError || copyError || share.error}</p>}
      <div className="p-4 sm:p-6">
        <article ref={posterRef} className="mx-auto w-full max-w-2xl rounded-2xl border-2 border-amber-800/40 bg-[#fffaf0] p-5 sm:p-8 text-slate-900 font-serif leading-relaxed" style={{ overflow: 'visible', overflowWrap: 'anywhere', boxSizing: 'border-box' }}>
          <header className="text-center border-b-2 border-red-800 pb-5 mb-5">
            <Scale className="mx-auto mb-2 text-red-800" size={32} />
            <p className="text-xs tracking-widest text-red-800">互联网最高破事法庭 · 终审盖章生效</p>
            <h2 className="text-2xl font-black text-red-800 mt-2">本案判决书</h2>
            <p className="text-xs text-slate-600 mt-2">{caseData.caseNumber}</p>
          </header>
          <div className="space-y-1 text-sm mb-5"><p><strong>案由：</strong>{caseData.title}</p><p><strong>原告本人：</strong>{caseData.plaintiffName}</p><p><strong>被告本人：</strong>{caseData.defendantName}</p><p><strong>陪审票决支持：</strong>{voteName}</p></div>
          <section className="mb-5"><h3 className="font-black border-l-4 border-red-800 pl-2 mb-2">案情陈述</h3><p className="text-sm whitespace-pre-wrap">{caseData.summary}</p><p className="text-xs text-slate-500 mt-2">本案事实经当庭激烈对质并记入终审档案，严禁当事人抵赖！</p></section>
          <section className="mb-5"><h3 className="font-black border-l-4 border-red-800 pl-2 mb-2">法官裁决</h3><p className="text-xs text-red-800 mb-2">支持方：{winnerName}</p><p className="rounded-xl border border-red-200 bg-red-50 p-4 font-black text-red-900 whitespace-pre-wrap">{ruling.result}</p></section>
          <section className="mb-5"><h3 className="font-black border-l-4 border-red-800 pl-2 mb-2">公开裁决理由</h3><ol className="list-decimal pl-5 space-y-2 text-sm">{ruling.reasons.map((reason, i) => <li className="whitespace-pre-wrap" key={i}>{reason}</li>)}</ol></section>
          <section className="mb-5"><h3 className="font-black border-l-4 border-red-800 pl-2 mb-2">本次裁决引用证物</h3>{selectedEvidence.length ? <ul className="space-y-3 text-sm">{selectedEvidence.map(evidence => <li key={evidence.id}><p className="font-bold">{evidence.name} <span className="font-normal text-slate-500">（{evidence.owner === 'plaintiff' ? '原告方' : '被告方'}）</span></p><p className="whitespace-pre-wrap">{evidence.description}</p></li>)}</ul> : <p className="text-sm text-slate-600">本次裁决未列明引用证物。</p>}</section>
          <section className="mb-5"><h3 className="font-black border-l-4 border-red-800 pl-2 mb-2">履行事项</h3>{ruling.penalty.length ? <ol className="list-decimal pl-5 space-y-2 text-sm">{ruling.penalty.map((penalty, i) => <li className="whitespace-pre-wrap" key={i}>{penalty}</li>)}</ol> : <p className="text-sm text-slate-600">本次裁决未设置额外履行事项。</p>}</section>
          <blockquote className="mb-5 rounded-xl border border-amber-300 bg-amber-100/60 p-4 text-sm whitespace-pre-wrap">{ruling.quote}</blockquote>
          <footer className="border-t border-amber-800/30 pt-4 text-right text-sm"><p>主审法官：{judge.name}</p><p>{date}</p><p className="mt-2 text-xs text-slate-500">互联网最高破事法庭 · 终审判决之印 · 立即执行</p></footer>
        </article>
      </div>
      <div className="px-5 pb-5 space-y-3 text-sm text-slate-700">
        {share.url && <details><summary className="cursor-pointer font-bold">完整案卷链接 · 可手动复制</summary><p className="text-xs text-slate-500 py-2">{shareUrl ? '这是本案的服务端固定链接，旁听和回放读取同一份记录。' : '本案专属电子传票与判词链接已就绪，速速发给当事人签收！'}</p><textarea aria-label="完整案卷链接" readOnly value={share.url} rows={3} onFocus={e => e.currentTarget.select()} className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs break-all" /></details>}
        {copyError && manualText && <label className="block">手动复制分享文字<textarea ref={fallbackRef} readOnly value={manualText} rows={6} onFocus={e => e.currentTarget.select()} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs" /></label>}
        <div className="flex flex-wrap gap-2 pt-2">{onStartAppeal && <button className={button} onClick={onStartAppeal}>不服判决？火速提起二审上诉！</button>}<button className={button} onClick={onPlayAgain}><RotateCcw size={16} />再审一起奇葩大案！</button></div>
      </div>
    </>}
  </Modal>;
}