import React, { useState } from 'react';
import { Flame, ShieldAlert, Sparkles, Send, Scale } from 'lucide-react';
import { CaseData, DialogueTurn } from '../types';
import { Modal } from './Modal';
import { sounds } from '../utils/sound';

interface AppealModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCase: CaseData;
  onAppealSubmitted: (updatedCase: CaseData) => void;
}

const APPEAL_REASONS = [
  '主审法官明显拉偏架！我怀疑他收了对方的半份螺蛳粉！',
  '对方律师全篇偷换概念！把‘偷吃薯片’偷换成‘帮我测试酥脆度’！',
  '我方关键证人刚才在上厕所没赶上作证！强烈要求二审开庭！',
  '量刑过重！罚抄10遍情书就算了，凭什么还要连带清理猫砂盆一个月？！',
  '我方发现了对方当庭串供的微信未撤回撤回记录！铁证如山！',
];

export const AppealModal: React.FC<AppealModalProps> = ({
  isOpen,
  onClose,
  currentCase,
  onAppealSubmitted,
}) => {
  const [appealer, setAppealer] = useState<'plaintiff' | 'defendant'>('defendant');
  const [reason, setReason] = useState(APPEAL_REASONS[0]);
  const [extraPlea, setExtraPlea] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sounds.playObjection();

    const appealerName =
      appealer === 'plaintiff' ? currentCase.plaintiffName : currentCase.defendantName;
    const opponentName =
      appealer === 'plaintiff' ? currentCase.defendantName : currentCase.plaintiffName;

    // Generate high-drama appeal turns
    const appealTurns: DialogueTurn[] = [
      {
        id: `appeal-judge-open-${Date.now()}`,
        speaker: 'judge',
        speakerName: '最高破事大法官',
        avatar: '⚖️',
        text: `【法槌重重砸下】咚！肃静！收到${appealerName}发起的紧急二审上诉状！互联网法庭本着‘看热闹不嫌事大’的最高原则，特准予二审就地再审！`,
        emotion: 'gavel',
        shout: 'ORDER',
        tiltChange: 0,
        danmaku: ['卧槽二审直接开打了！', '快把小板凳搬回来！', '上诉了上诉了！'],
      },
      {
        id: `appeal-statement-${Date.now()}`,
        speaker: appealer,
        speakerName: appealerName,
        avatar: appealer === 'plaintiff' ? '🐱' : '🦊',
        text: `【声泪俱下咆哮】一审判决严重践踏了宇宙公序良俗！上诉理由：${reason}！${extraPlea ? `额外追加申诉：${extraPlea}！` : ''} 请全网陪审官为我主持公道！`,
        emotion: 'shocked',
        shout: 'OBJECTION',
        tiltChange: appealer === 'plaintiff' ? 30 : -30,
        danmaku: ['这波上诉有备而来！', '打起来打起来！', '这理由我居然信了？！'],
      },
      {
        id: `appeal-rebuttal-${Date.now()}`,
        speaker: appealer === 'plaintiff' ? 'defendant' : 'plaintiff',
        speakerName: opponentName,
        avatar: appealer === 'plaintiff' ? '🦊' : '🐱',
        text: `【冷笑推眼镜】无谓的挣扎！你以为换个姿势在地上打滚，正义的天平就会向你倾斜吗？！`,
        emotion: 'smug',
        shout: 'TAKE_THAT',
        tiltChange: appealer === 'plaintiff' ? -20 : 20,
        danmaku: ['嘴硬也是一种态度', '哈哈哈哈绝了', '推眼镜动作帅的'],
      },
      {
        id: `appeal-judge-close-${Date.now()}`,
        speaker: 'judge',
        speakerName: '最高破事大法官',
        avatar: '⚖️',
        text: `精彩！双方杀气腾腾！陪审团请注意，本案进入二审终审决战，请双方继续呈堂肉搏！`,
        emotion: 'confident',
        tiltChange: 0,
      },
    ];

    const updatedCase: CaseData = {
      ...currentCase,
      title: `${currentCase.title}（二审决战）`,
      turns: appealTurns,
    };

    onAppealSubmitted(updatedCase);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🔥 提起二审上诉！"
      description="对一审判决一万个不服？立刻提起终审上诉，拉对方重回法庭受审！"
      className="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 text-slate-100">
        {/* Appellor Selection */}
        <div>
          <label className="text-xs font-bold text-amber-300 block mb-2">
            谁在上诉？（请选择上诉主体）
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setAppealer('plaintiff')}
              className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-3 ${
                appealer === 'plaintiff'
                  ? 'bg-red-950/70 border-red-500 shadow-md shadow-red-500/20 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="text-2xl">🐱</span>
              <div>
                <div className="text-xs font-black text-red-300">原告方上诉</div>
                <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                  {currentCase.plaintiffName}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setAppealer('defendant')}
              className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-3 ${
                appealer === 'defendant'
                  ? 'bg-cyan-950/70 border-cyan-500 shadow-md shadow-cyan-500/20 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="text-2xl">🦊</span>
              <div>
                <div className="text-xs font-black text-cyan-300">被告方上诉</div>
                <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                  {currentCase.defendantName}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Reason Presets */}
        <div>
          <label className="text-xs font-bold text-slate-300 block mb-1.5">
            ⚡ 核心上诉事由（点击一键填入）：
          </label>
          <div className="space-y-1.5">
            {APPEAL_REASONS.map((r, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setReason(r)}
                className={`w-full text-left text-xs p-2.5 rounded-xl border transition-all ${
                  reason === r
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Extra Plea */}
        <div>
          <label className="text-xs font-bold text-slate-300 block mb-1">
            额外反击辩词 / 破防控诉（选填）：
          </label>
          <textarea
            value={extraPlea}
            onChange={(e) => setExtraPlea(e.target.value)}
            placeholder="写下你最不服气的一句话，将直接作为二审当庭爆点！"
            rows={2}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 resize-none"
          />
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Scale className="w-3.5 h-3.5 text-amber-400" />
            <span>二审天平将重置归零，重新开庭！</span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
            >
              认栽服判
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-red-600 to-amber-500 hover:from-red-500 hover:to-amber-400 text-white font-black text-xs rounded-xl shadow-lg shadow-red-600/30 active:scale-95 transition-all"
            >
              <Flame className="w-4 h-4" />
              啪！正式立案二审！
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
