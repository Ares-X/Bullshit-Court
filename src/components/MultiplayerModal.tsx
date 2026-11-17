import React, { useEffect, useRef, useState } from 'react';
import { X, Users, Wifi, Copy, Check, Share2, Swords, ArrowRight, Sparkles, MessageCircle } from 'lucide-react';
import { multiplayerService, type RoomState } from '../utils/multiplayer';
import type { CaseData, CourtSession } from '../types';
import { createCaseShareUrl } from '../utils/caseShare';
import { sounds } from '../utils/sound';

interface MultiplayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCase: CaseData;
  session?: CourtSession;
  onMultiplayerConnected: (roomId: string, isHost: boolean) => void;
}

const incomingRoom = () => {
  const code = new URL(window.location.href).searchParams.get('room') ?? '';
  return /^\d{6}$/.test(code) ? code : '';
};

export const MultiplayerModal: React.FC<MultiplayerModalProps> = ({
  isOpen,
  onClose,
  currentCase,
  session,
  onMultiplayerConnected,
}) => {
  const [mode, setMode] = useState<'create' | 'join' | 'async'>(() => (incomingRoom() ? 'join' : 'create'));
  const [roomId, setRoomId] = useState(() => Math.floor(100000 + Math.random() * 900000).toString());
  const [joinRoomInput, setJoinRoomInput] = useState(incomingRoom);
  const [state, setState] = useState<RoomState>(multiplayerService.getState());
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const callback = useRef(onMultiplayerConnected);
  callback.current = onMultiplayerConnected;
  const notified = useRef('');

  useEffect(() => {
    return multiplayerService.subscribeStatus((next) => {
      setState(next);
      const ready = next.isHost
        ? ['ready', 'connected'].includes(next.status)
        : next.status === 'connected';
      const key = `${next.roomId}:${next.isHost}`;
      if (ready && notified.current !== key) {
        notified.current = key;
        callback.current(next.roomId, next.isHost);
      }
      if (next.status === 'disconnected') notified.current = '';
    });
  }, []);

  if (!isOpen) return null;

  const roomUrl = new URL(window.location.href);
  roomUrl.hash = '';
  roomUrl.search = '';
  roomUrl.searchParams.set('room', roomId);

  const active = ['ready', 'connected', 'connecting'].includes(state.status);

  const copy = async (value: string, label: string) => {
    try {
      sounds.playVoteClick();
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setError('');
      setTimeout(() => setCopied(''), 2500);
    } catch {
      setError('复制失败，请手动长按复制链接');
    }
  };

  const connect = (code: string, host: boolean) => {
    sounds.playGavel();
    setError('');
    notified.current = '';
    multiplayerService.init(code, host);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="multiplayer-title"
        className="bg-slate-900 border-2 border-cyan-500/40 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden text-slate-100"
      >
        <header className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <h2 id="multiplayer-title" className="text-lg sm:text-xl text-amber-100 font-black flex items-center gap-2 font-comic">
              <Users className="w-5 h-5 text-cyan-400" />
              邀请好友联机旁听 / 连线陪审！
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              两个 AI 辩护律师台上掐架，叫上你的损友们坐在台下投掷烂番茄并决定最终判决！
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭联机窗口"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
          >
            <X size={18} />
          </button>
        </header>

        {/* Tab navigation */}
        <nav className="px-6 pt-3 flex gap-2 text-xs border-b border-slate-800 bg-slate-950/30">
          {(['create', 'join', 'async'] as const).map((item, i) => (
            <button
              key={item}
              onClick={() => {
                sounds.playVoteClick();
                setMode(item);
                setError('');
              }}
              className={`pb-2.5 px-3 font-bold border-b-2 transition-all ${
                mode === item
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {['🏠 我要开房当房主', '🚪 输入房间号入席', '💌 微信朋友圈直发'][i]}
            </button>
          ))}
        </nav>

        <div className="p-6 space-y-4 text-xs text-slate-300">
          {mode === 'create' && (
            <div className="space-y-4">
              <div className="bg-cyan-950/40 border border-cyan-500/30 rounded-2xl p-3 text-cyan-200 leading-relaxed">
                👉 房主负责选定案卷并同步庭审节奏！好友扫码或点击链接即可实时入席陪审席，参与实时公决！
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block mb-1">专属 6 位开庭房间号：</span>
                <div className="flex gap-2">
                  <output
                    aria-label="房间号"
                    className="flex-1 text-center text-3xl font-mono font-black text-amber-300 p-3 bg-slate-950 border border-slate-800 rounded-2xl tracking-widest"
                  >
                    {roomId}
                  </output>
                  <button
                    disabled={active}
                    onClick={() => {
                      sounds.playVoteClick();
                      setRoomId(Math.floor(100000 + Math.random() * 900000).toString());
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-2xl text-xs"
                  >
                    换个号
                  </button>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block mb-1">一键分享链接发给微信群 / 朋友：</span>
                <div className="flex gap-2">
                  <input
                    aria-label="房间邀请链接"
                    readOnly
                    value={roomUrl.href}
                    className="min-w-0 flex-1 bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs text-slate-300 font-mono"
                  />
                  <button
                    onClick={() => copy(roomUrl.href, 'room')}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-black rounded-xl flex items-center gap-1.5 transition-all shrink-0"
                  >
                    {copied === 'room' ? <Check size={16} /> : <Copy size={16} />}
                    {copied === 'room' ? '已复制！' : '复制链接'}
                  </button>
                </div>
              </div>

              <button
                disabled={active}
                onClick={() => connect(roomId, true)}
                className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black text-sm rounded-2xl shadow-lg shadow-cyan-600/20 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
              >
                <Swords size={18} />
                {active ? '房间已开启，等待好友入席…' : '正式开启房间！召集全网陪审团！'}
              </button>
            </div>
          )}

          {mode === 'join' && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                connect(joinRoomInput.trim(), false);
              }}
            >
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">
                  请输入好友发来的 6 位开庭房间号：
                </label>
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={joinRoomInput}
                  onChange={(e) => setJoinRoomInput(e.target.value)}
                  className="block w-full text-center text-3xl font-mono font-black text-cyan-300 bg-slate-950 border border-slate-800 p-3 rounded-2xl tracking-widest focus:outline-none focus:border-cyan-400"
                />
              </div>

              <button
                disabled={active || joinRoomInput.length !== 6}
                className="w-full py-3 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-black text-sm rounded-2xl shadow-lg shadow-cyan-600/20 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-40"
              >
                <ArrowRight size={18} />
                {active ? '已连入法庭！' : '立即落座陪审席！'}
              </button>
            </form>
          )}

          {mode === 'async' && (
            <div className="space-y-4">
              <div className="bg-amber-950/40 border border-amber-500/30 rounded-2xl p-3 text-amber-200 leading-relaxed">
                <p className="font-bold mb-1">📜 微信朋友圈专属案卷卡片：</p>
                <p className="text-[11px] text-slate-300">
                  一键生成包含案由、控辩焦点与惩罚措施的完整案卷，好友点开即可围观这场世纪破事并随时发起二审上诉！
                </p>
              </div>

              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block mb-0.5">当前选定案卷：</span>
                <span className="text-sm font-black text-amber-300 font-comic">《{currentCase.title}》</span>
              </div>

              <button
                onClick={() => {
                  const shareText = `【互联网最高破事法庭·传票】
亲爱的，你被紧急列为《${currentCase.title}》的关键旁听陪审官！
控方(${currentCase.plaintiffName})与辩方(${currentCase.defendantName})正在法庭上疯狂撕逼，急需你的正义一票！
速来戳链接围观：${roomUrl.href}`;
                  void copy(shareText, 'case');
                }}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-sm rounded-2xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <MessageCircle size={18} />
                {copied === 'case' ? '微信传票文案已复制到剪贴板！' : '复制微信群专属召唤令'}
              </button>
            </div>
          )}

          {/* Realtime status badge */}
          {active && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-500/50 text-cyan-300">
              <Wifi size={16} className="animate-pulse" />
              <span>
                {state.status === 'connecting'
                  ? '正在搜寻法庭信号…'
                  : state.status === 'ready'
                  ? '房间已就绪，快把房间号发给朋友！'
                  : `已连线成功 · 现场共有 ${state.peers.length + 1} 位陪审员！`}
              </span>
            </div>
          )}

          {error && <p role="alert" className="text-red-400 text-center font-bold">{error}</p>}
        </div>

        <footer className="px-6 py-3 text-[11px] text-slate-400 border-t border-slate-800 flex items-center justify-between bg-slate-950/40">
          <span>✨ 基于 P2P WebRTC 实时互联，无须下载任何 App</span>
          {active && (
            <button
              onClick={() => multiplayerService.disconnect()}
              className="text-red-400 hover:text-red-300 underline font-bold"
            >
              断开房间
            </button>
          )}
        </footer>
      </section>
    </div>
  );
};
