import React, { useState } from 'react';
import { X, Gavel, Sparkles, Flame, ShieldAlert, ArrowRight, Bot } from 'lucide-react';
import { CaseData } from '../types';
import { PRESET_CASES } from '../data/presetCases';
import { sounds } from '../utils/sound';

interface CaseSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCase: (c: CaseData) => void;
  onOpenCustom: () => void;
}

export const CaseSelectModal: React.FC<CaseSelectModalProps> = ({
  isOpen,
  onClose,
  onSelectCase,
  onOpenCustom,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');

  if (!isOpen) return null;

  const categories = ['全部', '猎奇幽默', '美食争端', '职场黑洞', '当代玄学', '友谊塑料'];

  const filteredCases = selectedCategory === '全部'
    ? PRESET_CASES
    : PRESET_CASES.filter((c) => c.category === selectedCategory);

  const handlePickCase = (c: CaseData) => {
    sounds.playGavel();
    onSelectCase(c);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overscroll-contain">
      <div 
        className="bg-slate-900 border-2 border-amber-500/40 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl shadow-amber-500/10 overflow-hidden"
        role="dialog"
        aria-labelledby="case-select-title"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/40 border-b border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Gavel className="w-5 h-5" />
            </div>
            <div>
              <h2 id="case-select-title" className="text-xl font-black text-amber-100 font-comic tracking-wide">
                奇葩猎奇与黑色幽默案卷库
              </h2>
              <p className="text-xs text-slate-400">
                挑选一起荒诞离谱的奇葩破事，立即开庭！双方 AI 律师将激烈对质，由你裁决！
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Categories Bar */}
        <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center gap-2 overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setSelectedCategory(cat);
                sounds.playVoteClick();
              }}
              className={`px-3 py-1 rounded-full text-xs font-bold transition whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
          <button
            onClick={() => {
              onClose();
              onOpenCustom();
            }}
            className="ml-auto text-xs font-bold text-red-400 hover:text-red-300 flex items-center gap-1 shrink-0 px-2 py-1 rounded hover:bg-red-950/30"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>自定新案件 &gt;</span>
          </button>
        </div>

        {/* Cases Grid */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCases.map((c) => (
            <div
              key={c.id}
              onClick={() => handlePickCase(c)}
              className="group relative bg-slate-800/60 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-500/60 rounded-xl p-5 cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-amber-500/10 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-amber-400/80 border border-amber-500/20">
                    {c.caseNumber}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                    <Flame className="w-3 h-3 text-red-400" />
                    {c.category}
                  </span>
                </div>

                <h3 className="text-base font-black text-amber-100 group-hover:text-amber-300 transition mb-2 font-comic">
                  {c.title}
                </h3>

                <p className="text-xs text-slate-300 leading-relaxed line-clamp-3 mb-4">
                  {c.summary}
                </p>

                <div className="bg-slate-950/50 rounded-lg p-2.5 border border-slate-800 text-[11px] space-y-1 mb-3">
                  <div className="flex items-center gap-1.5 text-red-400">
                    <span className="font-bold">🔴 控方原告：</span>
                    <span className="text-slate-300 truncate">{c.plaintiffName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-cyan-400">
                    <span className="font-bold">🔵 辩方被告：</span>
                    <span className="text-slate-300 truncate">{c.defendantName}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-700/50 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1 flex-wrap">
                  {c.tags.slice(0, 3).map((t, i) => (
                    <span key={i} className="text-[10px] text-slate-400 bg-slate-900/60 px-1.5 py-0.5 rounded">
                      #{t}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1 font-bold text-amber-400 group-hover:translate-x-1 transition">
                  <span>打开案卷</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>✨ 身边有离谱的奇葩破事？点击右侧立刻起诉！</span>
          </div>
          <button
            onClick={() => {
              onClose();
              onOpenCustom();
            }}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold transition shadow"
          >
            ✍️ 我要起诉新破事！
          </button>
        </div>
      </div>
    </div>
  );
};
