import React, { useState } from 'react';
import { Bot, ChevronDown, Dices, FolderOpen, History, Music, Plus, Scale, Settings2, Users, Volume2, VolumeX } from 'lucide-react';
import { sounds } from '../utils/sound';

interface HeaderProps {
  onHome: () => void; onOpenLibrary: () => void;
  onBringAgent: () => void; onOpenLobby: () => void;
  onOpenSelectCase: () => void; onOpenCustomCase: () => void; onOpenAgentHub: () => void;
  onOpenHistory: () => void; onOpenMultiplayer: () => void; onRandomCase: () => void;
  onOpenCast: () => void; onOpenConfig: () => void;
}
export const Header: React.FC<HeaderProps> = props => {
  const [muted, setMuted] = useState(sounds.getMuted());
  const [bgm, setBgm] = useState(sounds.getBgmPlaying());
  const [more, setMore] = useState(false);
  return <header className="court-header"><div className="court-header__inner">
    <button className="court-brand" onClick={props.onHome}><span className="court-brand__mark"><Scale size={25} /></span><span><strong>互联网最高破事法庭</strong><small>三个 Agent 吵破事 · 真人陪审投一票</small></span></button>
    <nav className="court-header__actions" aria-label="法庭工具">
      <button className="court-button court-button--primary" onClick={props.onBringAgent}><Bot size={16} />派 Agent 出庭</button>
      <button className="court-button" onClick={props.onOpenLobby}><Users size={16} />开庭大厅</button>
      <button className="court-button" onClick={props.onOpenLibrary}><History size={16} />判决库</button>
      <div className="court-more"><button className="court-icon-button" onClick={() => setMore(!more)} aria-label="更多设置" aria-expanded={more}><ChevronDown size={19} /></button>
        {more && <div className="court-more__menu">
          <button onClick={() => { setMore(false); props.onOpenSelectCase(); }}><FolderOpen size={16} />换个案子</button>
          <button onClick={() => { setMore(false); props.onOpenCustomCase(); }}><Plus size={16} />我要立案</button>
          <button onClick={() => { setMore(false); props.onOpenCast(); }}><Users size={16} />挑选法官</button>
          <button onClick={() => { setMore(false); props.onOpenConfig(); }}><Settings2 size={16} />Agent 模式</button>
          <button onClick={() => { setMore(false); props.onOpenMultiplayer(); }}><Users size={16} />邀请陪审团</button>
          <button onClick={() => { setMore(false); props.onOpenHistory(); }}><History size={16} />本机旧档</button>
          <button onClick={() => { setMore(false); props.onOpenAgentHub(); }}><Bot size={16} />外部 Agent 接入</button>
          <button onClick={() => { setMore(false); props.onRandomCase(); }}><Dices size={16} />随机开庭</button>
          <button onClick={() => setBgm(sounds.toggleBGM())}><Music size={16} />{bgm ? '关闭背景乐' : '开启背景乐'}</button>
          <button onClick={() => setMuted(sounds.toggleMute())}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}{muted ? '开启音效' : '关闭音效'}</button>
        </div>}
      </div>
    </nav>
  </div></header>;
};
