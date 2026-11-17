import React, { useState } from 'react';
import { BookOpen, PlusCircle, Sparkles, AlertCircle, Shield, Swords } from 'lucide-react';
import { Evidence, CaseData } from '../types';
import { Modal } from './Modal';
import { sounds } from '../utils/sound';

interface EvidenceLockerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCase?: CaseData;
  evidences?: Evidence[];
  onAddEvidence?: (evidence: Evidence) => void;
}

const FUNNY_EVIDENCE_PRESETS = [
  { name: '未打码微信聊天截图', desc: '红圈重点标注对方撤回的‘哈哈’其实是冷笑。', icon: '📱', owner: 'plaintiff' as const },
  { name: '凌晨2点47分外卖小票', desc: '证据显示对方声称睡觉实际点了两份特辣螺蛳粉。', icon: '🧾', owner: 'defendant' as const },
  { name: '朋友圈秒删分组动态', desc: '仅3人可见的吐槽，经技术专家手滑点赞公证。', icon: '📸', owner: 'plaintiff' as const },
  { name: '网易云单曲循环99+记录', desc: '充分证明其在深夜emo背后有着极其缜密的诡辩动机。', icon: '🎵', owner: 'defendant' as const },
  { name: '火锅锅底捞出的烂土豆', desc: '煮了三小时已经化成糊糊，严重污染了整锅清汤！', icon: '🥔', owner: 'plaintiff' as const },
];

export const EvidenceLockerModal: React.FC<EvidenceLockerModalProps> = ({
  isOpen,
  onClose,
  currentCase,
  evidences: propEvidences,
  onAddEvidence,
}) => {
  const evidencesList = propEvidences || currentCase?.evidences || [];
  const [selectedId, setSelectedId] = useState<string>(evidencesList[0]?.id || '');
  const [showAddForm, setShowAddForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customOwner, setCustomOwner] = useState<'plaintiff' | 'defendant'>('plaintiff');

  const selectedEvidence = evidencesList.find((e) => e.id === selectedId) || evidencesList[0];

  const handleSelectPreset = (preset: typeof FUNNY_EVIDENCE_PRESETS[0]) => {
    setCustomName(preset.name);
    setCustomDesc(preset.desc);
    setCustomOwner(preset.owner);
  };

  const handleAddNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim() || !onAddEvidence) return;
    sounds.playGavel();

    const newEvidence: Evidence = {
      id: `ev-${Date.now()}`,
      name: customName.trim(),
      description: customDesc.trim() || '无声胜有声的铁证！',
      icon: customOwner === 'plaintiff' ? '💥' : '🛡️',
      owner: customOwner,
    };

    onAddEvidence(newEvidence);
    setSelectedId(newEvidence.id);
    setCustomName('');
    setCustomDesc('');
    setShowAddForm(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="📂 法庭物证陈列保管库"
      description="这里封存着改变全场战局的致命物证！真人陪审官亦可当庭突击补交新物证！"
      className="max-w-2xl"
    >
      <div className="p-5 sm:p-6 space-y-5 text-slate-100">
        {/* Toggle between viewing and submitting */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest font-mono">
              EVIDENCE LOCKER
            </span>
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
              共 {evidencesList.length} 件在堂物证
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              sounds.playVoteClick();
              setShowAddForm(!showAddForm);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-black bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 px-3 py-1.5 rounded-xl hover:from-amber-400 hover:to-yellow-300 shadow-md transition-all active:scale-95"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            {showAddForm ? '返回查看物证' : '突击递交新物证！'}
          </button>
        </div>

        {showAddForm ? (
          /* Add custom evidence form */
          <form onSubmit={handleAddNew} className="space-y-4 bg-slate-900/90 border border-amber-500/30 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-amber-300 text-sm font-bold">
              <Sparkles className="w-4 h-4" />
              <span>当庭递交突击致命新物证</span>
            </div>

            {/* Quick Presets */}
            <div>
              <span className="text-[11px] text-slate-400 block mb-1.5">⚡ 快速选用爆笑证物模板：</span>
              <div className="flex flex-wrap gap-1.5">
                {FUNNY_EVIDENCE_PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectPreset(p)}
                    className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1 rounded-lg transition-all text-left"
                  >
                    <span>{p.icon} </span>
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">证物名称 *</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="例如：3天前撤回的未读消息截屏"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">呈堂归属方</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomOwner('plaintiff')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      customOwner === 'plaintiff'
                        ? 'bg-red-500/20 border-red-500 text-red-300 shadow-sm shadow-red-500/20'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Swords className="w-3.5 h-3.5" />
                    原告控方
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomOwner('defendant')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      customOwner === 'defendant'
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-sm shadow-cyan-500/20'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    被告辩方
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-300 font-bold block mb-1">杀伤力说明 / 证明目的</label>
              <textarea
                value={customDesc}
                onChange={(e) => setCustomDesc(e.target.value)}
                placeholder="详细写明此物证如何啪啪打对方的脸…"
                rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-xs rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-black bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 rounded-xl hover:from-amber-400 hover:to-yellow-300 shadow-md"
              >
                砰！立刻呈堂！
              </button>
            </div>
          </form>
        ) : (
          /* View list of evidences */
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            {/* Left Evidence Selector List */}
            <div className="sm:col-span-5 space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {evidencesList.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  本案暂无封存物证
                </div>
              ) : (
                evidencesList.map((item) => {
                  const isSelected = (selectedEvidence?.id || '') === item.id;
                  const isPlaintiff = item.owner === 'plaintiff';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        sounds.playVoteClick();
                        setSelectedId(item.id);
                      }}
                      className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-2.5 ${
                        isSelected
                          ? isPlaintiff
                            ? 'bg-red-950/60 border-red-500 shadow-md shadow-red-500/10'
                            : 'bg-cyan-950/60 border-cyan-500 shadow-md shadow-cyan-500/10'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-400'
                      }`}
                    >
                      <span className="text-lg shrink-0">{item.icon || (isPlaintiff ? '💥' : '🛡️')}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className={`text-xs font-black truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                            {item.name}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold shrink-0 ${
                              isPlaintiff ? 'bg-red-500/20 text-red-300' : 'bg-cyan-500/20 text-cyan-300'
                            }`}
                          >
                            {isPlaintiff ? '控方' : '辩方'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 line-clamp-1">
                          {item.description}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Right Detailed Evidence Showcase */}
            <div className="sm:col-span-7 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
              {selectedEvidence ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        selectedEvidence.owner === 'plaintiff'
                          ? 'bg-red-500/20 border-red-500/40 text-red-300'
                          : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                      }`}
                    >
                      {selectedEvidence.owner === 'plaintiff' ? '🔴 控方原告杀手锏' : '🔵 辩方被告防御盾'}
                    </span>
                    <span className="text-2xl">{selectedEvidence.icon || '📜'}</span>
                  </div>

                  <h3 className="text-base font-black text-amber-200 mb-2 font-comic">
                    《{selectedEvidence.name}》
                  </h3>

                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 mb-4">
                    {selectedEvidence.description}
                  </p>

                  <div className="flex items-center gap-2 text-[10px] text-amber-400/80 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>本物证已由互联网法庭书记官盖章公证，随时可用于庭上辩论与反驳！</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-500 text-xs">
                  请从左侧选择一件物证查看详情
                </div>
              )}

              <div className="pt-4 border-t border-slate-800/80 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all"
                >
                  关闭物证库
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
