import { useEffect, useState, type MouseEvent } from 'react';
import { Clock, Download, FileText, History, RotateCcw, Scale, Trash2 } from 'lucide-react';
import { type TrialRecord, getTrialRecords, deleteTrialRecord, clearAllTrialRecords, getCourtStorageError } from '../utils/historyStorage';
import { sounds } from '../utils/sound';
import { Modal } from './Modal';

interface HistoryArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReplayTrial: (record: TrialRecord) => void;
  onViewHistoricalVerdict: (record: TrialRecord) => void;
}

export function HistoryArchiveModal({ isOpen, onClose, onReplayTrial, onViewHistoricalVerdict }: HistoryArchiveModalProps) {
  const [records, setRecords] = useState<TrialRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    setRecords(getTrialRecords());
    setError(getCourtStorageError());
  }, [isOpen]);

  const reload = (operationSucceeded: boolean) => {
    const operationError = getCourtStorageError();
    setRecords(getTrialRecords());
    setError(operationSucceeded ? getCourtStorageError() : operationError);
  };
  const handleDelete = (id: string, event: MouseEvent) => {
    event.stopPropagation();
    sounds.playVoteClick();
    reload(deleteTrialRecord(id));
  };
  const handleClearAll = () => {
    if (!window.confirm('确定删除所有历史案卷吗？此操作无法撤销，当前庭审进度会保留。')) return;
    sounds.playVoteClick();
    reload(clearAllTrialRecords());
  };
  const handleExport = () => {
    const link = document.createElement('a');
    link.href = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(records, null, 2))}`;
    link.download = `互联网法庭历史案卷-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
  const replay = (record: TrialRecord) => {
    sounds.playGavel();
    onClose();
    onReplayTrial(record);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="历史庭审案卷" description="封存过往所有激烈交锋与盖章生效的荒诞判决书！" className="max-w-3xl">
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-slate-300 flex items-center gap-2"><History size={17} />共 {records.length} 份可读案卷</span>
          {records.length > 0 && <button type="button" onClick={handleExport} className="flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-amber-200 hover:bg-slate-800"><Download size={16} />导出可读案卷</button>}
        </div>
        {error && <p role="alert" className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-3 text-sm text-amber-200">{error}</p>}
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {records.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Scale size={44} className="mx-auto mb-4" />
              <p className="font-bold text-slate-200">尚无可读的历史案卷</p>
              <p className="mt-2 text-sm">完成一场庭审并完成陪审投票后，盖章判决书将自动归档于此。</p>
            </div>
          ) : records.map(record => {
            const happened = Boolean(record.session);
            const result = record.winner === 'draw' ? '未分胜负' : record.winner === 'plaintiff' ? '支持原告' : '支持被告';
            return (
              <article key={record.id} className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
                <div className="flex items-center gap-2 flex-wrap text-xs mb-2">
                  <span className="font-mono text-amber-200">{record.caseNumber}</span>
                  <span className="text-slate-400 flex items-center gap-1"><Clock size={12} />{new Date(record.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="rounded bg-slate-950 px-2 py-1 text-slate-200">{result}</span>
                </div>
                <h3 className="font-bold text-amber-100">{record.caseData.title}</h3>
                <p className="mt-1 text-xs text-slate-400">原告：{record.caseData.plaintiffName} · 被告：{record.caseData.defendantName}</p>
                <p className="mt-2 text-xs text-amber-200/90">{happened ? `现场庭审实录 · ${record.session!.mode === 'external' ? '外部 Agent 对决' : '实时激辩'} · ${record.session!.turns.length} 轮发言` : '往期经典判例 · 盖章留档'}</p>
                <p className="mt-2 text-sm text-slate-300 line-clamp-2">{record.verdictResult}</p>
                <div className="mt-4 flex items-center flex-wrap gap-2">
                  <button type="button" onClick={() => { onClose(); onViewHistoricalVerdict(record); }} className="flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-xs text-amber-200 hover:bg-slate-700"><FileText size={14} />查看裁决</button>
                  <button type="button" onClick={() => replay(record)} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"><RotateCcw size={14} />{happened ? '回放庭审实录' : '回看经典案卷'}</button>
                  <button type="button" onClick={event => handleDelete(record.id, event)} aria-label={`删除案卷：${record.caseData.title}`} title="删除这份案卷" className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-red-300"><Trash2 size={17} /></button>
                </div>
              </article>
            );
          })}
        </div>
        {(records.length > 0 || error) && <div className="border-t border-slate-700 pt-4 text-right"><button type="button" onClick={handleClearAll} className="text-sm text-red-300 underline hover:text-red-200" aria-label="删除所有历史案卷">清空历史案卷</button></div>}
      </div>
    </Modal>
  );
}