import React, { useState } from 'react';
import { Bot, Copy, Check, Sparkles, Terminal, Code2, Send, Cpu, Zap } from 'lucide-react';
import { CaseData, DialogueTurn, CourtSession, CourtRole } from '../types';
import { Modal } from './Modal';
import { sounds } from '../utils/sound';

interface AgentHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCase?: CaseData;
  onInjectAgentTurn?: (turn: DialogueTurn) => void;
  // Backward compatibility with platform hooks if present
  session?: CourtSession;
  connection?: any;
  connecting?: boolean;
  error?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export const AgentHubModal: React.FC<AgentHubModalProps> = ({
  isOpen,
  onClose,
  currentCase,
  onInjectAgentTurn,
  session,
  connection,
  connecting = false,
  error,
  onConnect,
  onDisconnect,
}) => {
  const [activeTab, setActiveTab] = useState<'prompt' | 'mcp' | 'inject'>('prompt');
  const [copiedType, setCopiedType] = useState<string | null>(null);

  // Injection state
  const [injectRole, setInjectRole] = useState<'plaintiff' | 'defendant' | 'judge'>('plaintiff');
  const [injectText, setInjectText] = useState('');
  const [injectShout, setInjectShout] = useState<'OBJECTION' | 'HOLD_IT' | 'TAKE_THAT' | 'ORDER' | undefined>('OBJECTION');
  const [injectTilt, setInjectTilt] = useState<number>(20);

  const activeCaseTitle = currentCase?.title || session?.caseData?.title || '火锅涮土豆案';
  const plaintiffName = currentCase?.plaintiffName || session?.caseData?.plaintiffName || '原告猫猫';
  const defendantName = currentCase?.defendantName || session?.caseData?.defendantName || '被告狐狸';

  const handleCopy = (text: string, type: string) => {
    sounds.playVoteClick();
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  const PROMPT_PLAINTIFF = `你现在是《互联网最高破事法庭》的原告AI辩护律师。
【当前案由】：${activeCaseTitle}
【原告当事人】：${plaintiffName}
【核心主张】：对方的行为严重反人类、违反公序良俗，必须公开道歉并承担离谱惩罚！
【辩护风格】：
1. 情绪极其激昂，语速极快，擅长使用逻辑滑坡与夸张比喻！
2. 喜欢突然大喊‘OBJECTION！’（反对）打断全场！
3. 每句话都要把鸡毛蒜皮的破事上升到宇宙公理与文明兴亡！
4. 语言幽默犀利，严禁打官腔，纯正互联网黑色幽默，请用第一人称慷慨陈词！`;

  const PROMPT_DEFENDANT = `你现在是《互联网最高破事法庭》的被告AI辩护律师。
【当前案由】：${activeCaseTitle}
【被告当事人】：${defendantName}
【核心主张】：我方当事人完全无辜！原告纯属小题大做、玻璃心、无理取闹！
【辩护风格】：
1. 极度从容冷淡，阴阳怪气，喜欢用伪科学伪心理学推导对方破防！
2. 擅长推眼镜并抛出‘TAKE THAT！’（接招吧）予以绝杀反击！
3. 把对方看似合理的诉求拆解为荒谬至极的封建残余或无理取闹！
4. 语言风趣高级，反讽拉满，请用第一人称当庭反驳！`;

  const PROMPT_JUDGE = `你现在是《互联网最高破事法庭》的最高终审大法官。
【案由】：${activeCaseTitle}
【裁判准则】：唯恐天下不乱，秉持‘看热闹不嫌事大’的判案哲学。
【审理风格】：
1. 动不动重敲法槌‘咚！ORDER！’镇压全场！
2. 毒舌点评双方的离谱发言，总结双方各自的破防核心！
3. 宣判充满荒诞惩罚（如‘罚抄聊天记录100遍’、‘给全群发20元奶茶赔罪’）！`;

  const MCP_CONFIG = JSON.stringify(
    {
      mcpServers: {
        'internet-court': {
          command: 'python3',
          args: ['/绝对路径/mcp-server/court_mcp.py'],
          env: {
            COURT_BRIDGE_URL: connection?.baseUrl || 'http://127.0.0.1:8765',
            COURT_SESSION_ID: connection?.sessionId || 'court-session-live',
          },
        },
      },
    },
    null,
    2
  );

  const handleManualInject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!injectText.trim()) return;

    sounds.playObjection();

    const turn: DialogueTurn = {
      id: `inject-${Date.now()}`,
      speaker: injectRole,
      speakerName:
        injectRole === 'plaintiff'
          ? `${plaintiffName}（外部Agent）`
          : injectRole === 'defendant'
          ? `${defendantName}（外部Agent）`
          : '最高大法官（外部Agent）',
      avatar: injectRole === 'plaintiff' ? '🐱' : injectRole === 'defendant' ? '🦊' : '⚖️',
      text: injectText.trim(),
      emotion: injectRole === 'judge' ? 'gavel' : 'shocked',
      shout: injectShout,
      tiltChange: injectRole === 'plaintiff' ? injectTilt : injectRole === 'defendant' ? -injectTilt : 0,
      danmaku: ['卧槽外部Agent空降了！', '这辩词绝了！', '杀疯了杀疯了！'],
    };

    if (onInjectAgentTurn) {
      onInjectAgentTurn(turn);
    }

    setInjectText('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🤖 Agent 枢纽接入指南"
      description="让任何大模型（Claude、Cursor、GPT、DeepSeek、Dify）作为辩护律师加入本场庭审！"
      className="max-w-3xl"
    >
      <div className="p-5 sm:p-6 space-y-5 text-slate-100">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('prompt')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'prompt'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bot className="w-4 h-4" />
            角色设定提示词（Prompts）
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mcp')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'mcp'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-4 h-4" />
            MCP 协议直连
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('inject')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition-all ${
              activeTab === 'inject'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-4 h-4" />
            ⚡ 模拟当庭突击插嘴
          </button>
        </div>

        {/* Tab 1: Prompts */}
        {activeTab === 'prompt' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              把以下提示词复制给你常用的 AI 助手（如 ChatGPT、Claude、Kimi 或你自己的私有 Agent），它就会立刻化身控辩律师或大法官与全场激辩：
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Plaintiff Prompt */}
              <div className="bg-slate-900/90 border border-red-500/30 rounded-2xl p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-red-400">🔴 原告辩护律者</span>
                    <span className="text-sm">🐱</span>
                  </div>
                  <pre className="text-[10px] text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800 whitespace-pre-wrap font-sans max-h-48 overflow-y-auto leading-relaxed">
                    {PROMPT_PLAINTIFF}
                  </pre>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(PROMPT_PLAINTIFF, 'plaintiff')}
                  className="mt-3 w-full py-1.5 px-3 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
                >
                  {copiedType === 'plaintiff' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedType === 'plaintiff' ? '已复制原告词！' : '复制原告 Prompt'}
                </button>
              </div>

              {/* Defendant Prompt */}
              <div className="bg-slate-900/90 border border-cyan-500/30 rounded-2xl p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-cyan-400">🔵 被告辩护律者</span>
                    <span className="text-sm">🦊</span>
                  </div>
                  <pre className="text-[10px] text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800 whitespace-pre-wrap font-sans max-h-48 overflow-y-auto leading-relaxed">
                    {PROMPT_DEFENDANT}
                  </pre>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(PROMPT_DEFENDANT, 'defendant')}
                  className="mt-3 w-full py-1.5 px-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
                >
                  {copiedType === 'defendant' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedType === 'defendant' ? '已复制被告词！' : '复制被告 Prompt'}
                </button>
              </div>

              {/* Judge Prompt */}
              <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-amber-400">⚖️ 最高终审法官</span>
                    <span className="text-sm">👑</span>
                  </div>
                  <pre className="text-[10px] text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800 whitespace-pre-wrap font-sans max-h-48 overflow-y-auto leading-relaxed">
                    {PROMPT_JUDGE}
                  </pre>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(PROMPT_JUDGE, 'judge')}
                  className="mt-3 w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
                >
                  {copiedType === 'judge' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedType === 'judge' ? '已复制法官词！' : '复制法官 Prompt'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: MCP Config */}
        {activeTab === 'mcp' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300 font-bold">
                一键复制 Claude Desktop / Cursor 的 MCP 配置文件：
              </span>
              <button
                type="button"
                onClick={() => handleCopy(MCP_CONFIG, 'mcp')}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 transition-all"
              >
                {copiedType === 'mcp' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedType === 'mcp' ? '已复制配置！' : '复制 MCP JSON'}
              </button>
            </div>

            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-2xl text-[11px] text-amber-300 font-mono overflow-x-auto leading-relaxed">
              {MCP_CONFIG}
            </pre>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-xs text-slate-400 space-y-1">
              <p className="font-bold text-slate-200">💡 接入步骤：</p>
              <p>1. 本地运行 Python 服务：<code className="text-amber-400 bg-slate-950 px-1 py-0.5 rounded">python3 mcp-server/court_mcp.py</code></p>
              <p>2. 将上述 JSON 粘贴到你的 Claude 或 Cursor MCP 客户端配置中。</p>
              <p>3. 外部 Agent 调用 <code className="text-cyan-400 font-mono">submit_turn()</code> 工具即可实时向正在进行的法庭发射辩词！</p>
            </div>
          </div>
        )}

        {/* Tab 3: Manual Direct Injection */}
        {activeTab === 'inject' && (
          <form onSubmit={handleManualInject} className="space-y-4 bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
              <Sparkles className="w-4 h-4" />
              <span>当庭插话测试（把你的 Agent 辩词直接注入现场进行辩论）：</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">说话角色</label>
                <select
                  value={injectRole}
                  onChange={(e) => setInjectRole(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                >
                  <option value="plaintiff">🔴 原告律师（猫猫）</option>
                  <option value="defendant">🔵 被告律师（狐狸）</option>
                  <option value="judge">⚖️ 最高大法官</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">震屏咆哮特效</label>
                <select
                  value={injectShout || ''}
                  onChange={(e) => setInjectShout((e.target.value || undefined) as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                >
                  <option value="OBJECTION">OBJECTION!（反对！）</option>
                  <option value="HOLD_IT">HOLD IT!（等等！）</option>
                  <option value="TAKE_THAT">TAKE THAT!（看招！）</option>
                  <option value="ORDER">ORDER!（肃静！）</option>
                  <option value="">无咆哮</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">天平倾角冲击力 (±{injectTilt})</label>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={injectTilt}
                  onChange={(e) => setInjectTilt(Number(e.target.value))}
                  className="w-full accent-amber-400 mt-2"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">发言内容 / 辩护词 *</label>
              <textarea
                value={injectText}
                onChange={(e) => setInjectText(e.target.value)}
                placeholder="在此输入外部 Agent 吐出的犀利金句…"
                rows={3}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
              >
                取消
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 text-xs font-black rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                啪！立刻送达法庭插话！
              </button>
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
          >
            关闭窗口
          </button>
        </div>
      </div>
    </Modal>
  );
};
