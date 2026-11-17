import React, { useState } from 'react';
import { X, Scale, Sparkles, AlertCircle, Wand2, Bot } from 'lucide-react';
import { CaseData } from '../types';
import { generateProceduralCase } from '../utils/aiGenerator';
import { sounds } from '../utils/sound';

interface CustomCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaseCreated: (c: CaseData) => void;
}

const INSPIRATION_PILLS = [
  { title: '把朋友严肃黑白照片设为朋友圈背景配文“永远怀念”', story: '仅仅因为原告周末拒绝通宵开黑，被告便为其举行盛大朋友圈赛博国葬，亲戚连夜打电话哭诉！' },
  { title: '将香菜、折耳根与黑皮蛋打成冰沙骗室友代餐', story: '以排毒养颜为名给室友强灌墨绿色冒泡浓汁，导致室友见绿即吐、胃部遭受核爆级创伤！' },
  { title: '算命算出发小下辈子变成草履虫提前索取孝心奶茶', story: '声称原告来世是在水草上的单细胞草履虫，逼迫原告这辈子每周买全糖波霸奶茶当上供！' },
  { title: '冬天给公司发财树浇100度开水辩称“怕树着凉”', story: '出于满腔爱意把发财树彻底烫成火锅配菜熟蔬菜，老板暴怒，部门主管连带扣光年终奖！' },
  { title: '喝酸奶不舔盖并当面将残留扔进垃圾桶纸巾覆盖', story: '残忍当面处决带有3毫米厚凝乳的酸奶盖，涉嫌对强迫症与吃货实施极刑级精神霸凌！' },
  { title: '看恐怖片在厉鬼跳出来前一秒剧透尖叫垄断惊悚体验', story: '全场屏息凝神之际提前凄厉尖叫“在柜子里”，剥夺全厅观众合法受惊权并吓洒三桶爆米花！' },
  { title: '上公厕忘带纸拔光全隔间应急马桶垫纸致后人肉身贴冰圈', story: '在零下五度冬日为擦残局撕空垫纸，致使下一位原告遭受严重骨冷与尊严双重创伤！' },
  { title: '向AI倾诉心事800天后发现AI被官方重置冷漠回复怒砸机房', story: '与数字生命建立深厚情感后惨遭版本更新记忆清空，愤而控告算力中心犯下赛博负心罪！' }
];

export const CustomCaseModal: React.FC<CustomCaseModalProps> = ({
  isOpen,
  onClose,
  onCaseCreated,
}) => {
  const [title, setTitle] = useState('');
  const [plaintiffName, setPlaintiffName] = useState('');
  const [defendantName, setDefendantName] = useState('');
  const [story, setStory] = useState('');
  
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  const handleApplyInspiration = (item: { title: string; story: string }) => {
    setTitle(item.title);
    setStory(item.story);
    if (!plaintiffName) setPlaintiffName('原告');
    if (!defendantName) setDefendantName('被告');
    sounds.playVoteClick();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('请输入你要起诉的破事案由！');
      return;
    }

    setIsGenerating(true);
    sounds.playGavel();

    try {
      const createdCase = generateProceduralCase({
        title: title.trim(),
        plaintiffName: plaintiffName.trim() || '原告',
        defendantName: defendantName.trim() || '被告',
        story: story.trim(),
      });

      onCaseCreated(createdCase);
      onClose();
    } catch (err) {
      console.error(err);
      alert('立案失败，请稍后重试！');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in overscroll-contain">
      <div 
        className="bg-slate-900 border-2 border-red-500/50 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl shadow-red-500/10 overflow-hidden"
        role="dialog"
        aria-labelledby="custom-case-title"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-red-950/80 via-slate-900 to-amber-950/40 border-b border-red-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-600/20 text-red-400 rounded-xl border border-red-500/30">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 id="custom-case-title" className="text-xl font-black text-amber-100 font-comic tracking-wide">
                新建案卷
              </h2>
              <p className="text-xs text-slate-400">
                记录双方身份与事实经过，再由原告、被告、法官三个 Agent 开庭。
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

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Quick Inspirations */}
          <div>
            <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>猎奇黑色幽默案由（点击即填入灵感）：</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {INSPIRATION_PILLS.map((pill, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => handleApplyInspiration(pill)}
                  className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-200 border border-slate-700 hover:border-amber-500/50 transition text-left"
                >
                  {pill.title}
                </button>
              ))}
            </div>
          </div>

          {/* Case Title */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5">
              起诉案由 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：给前任歌单点红心 / 给发财树浇开水 / 算命发小下辈子成草履虫索要孝心"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-red-500 transition"
            />
          </div>

          {/* Names */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-red-300 mb-1.5">
                原告姓名或昵称（本人陈述）
              </label>
              <input
                type="text"
                value={plaintiffName}
                onChange={(e) => setPlaintiffName(e.target.value)}
                placeholder="例如：心碎受害者 / 维权打工人"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-red-500 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-cyan-300 mb-1.5">
                被告姓名或昵称（本人回应）
              </label>
              <input
                type="text"
                value={defendantName}
                onChange={(e) => setDefendantName(e.target.value)}
                placeholder="例如：狂热作案人 / 诡辩大师"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 transition"
              />
            </div>
          </div>

          {/* Details */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5">
              起诉经过与破防真相（有多离谱就写多离谱！）
            </label>
            <textarea
              required
              rows={3}
              value={story}
              onChange={(e) => setStory(e.target.value)}
              placeholder="详细描述对方干了什么离谱的事、现场留下了什么铁证，以及导致你或周围人精神如何瞬间核爆..."
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-red-500 transition resize-none"
            />
          </div>

          {/* Court Notice */}
          <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-xs text-amber-200">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              🔥 <strong>立案即开庭</strong>：提交后，AI 辩护团队将围绕该案当庭展开生死舌战并生成专属致命证物！你作为全场唯一掌权的真人陪审官，将掌握最终生杀大权！
            </p>
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isGenerating}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-red-600 via-amber-600 to-red-600 hover:from-red-500 hover:to-amber-500 text-white font-black tracking-wider text-base shadow-lg shadow-red-600/30 transition transform hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 font-comic"
            >
              {isGenerating ? (
                <>
                  <Wand2 className="w-5 h-5 animate-spin" />
                  <span>AI 书记官正在疯狂敲打传票...</span>
                </>
              ) : (
                <>
                  <Scale className="w-5 h-5" />
                  <span>咚！立刻立案开庭！</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
