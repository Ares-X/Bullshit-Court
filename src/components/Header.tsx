import React, { useState } from 'react';
import { Bot, ChevronDown, Globe, History, Music, Plus, Scale, Settings2, Users, Volume2, VolumeX } from 'lucide-react';
import { sounds } from '../utils/sound';
import { type Language, TRANSLATIONS } from '../i18n';

interface HeaderProps {
  onHome: () => void; onOpenLibrary: () => void;
  onFileCase: () => void; onOpenLobby: () => void; onOpenAgentHub: () => void;
  onOpenHistory: () => void; onOpenMultiplayer: () => void;
  onOpenCast: () => void; onOpenConfig: () => void; localTools: boolean;
}

const LANG_LABELS: Record<Language, string> = {
  zh_CN: '🇨🇳 简体中文',
  zh_TW: '🇭🇰 繁體中文',
  en_US: '🇺🇸 English',
  ja_JP: '🇯🇵 日本語',
};

export const Header: React.FC<HeaderProps> = props => {
  const [muted, setMuted] = useState(sounds.getMuted());
  const [bgm, setBgm] = useState(sounds.getBgmPlaying());
  const [more, setMore] = useState(false);
  const [lang, setLang] = useState<Language>(() => {
    try { return (localStorage.getItem('court_lang') as Language) || 'zh_CN'; }
    catch { return 'zh_CN'; }
  });

  const toggleLanguage = () => {
    const list: Language[] = ['zh_CN', 'zh_TW', 'en_US', 'ja_JP'];
    const next = list[(list.indexOf(lang) + 1) % list.length];
    setLang(next);
    try { localStorage.setItem('court_lang', next); } catch { /* ignore */ }
  };

  const t = TRANSLATIONS[lang] || TRANSLATIONS.zh_CN;

  return <header className="court-header"><div className="court-header__inner">
    <button className="court-brand" onClick={props.onHome}><span className="court-brand__mark"><Scale size={25} /></span><span><strong>{t.appTitle}</strong><small>{t.appSubtitle}</small></span></button>
    <nav className="court-header__actions" aria-label="法庭工具">
      <button className="court-button court-button--primary" onClick={props.onFileCase}><Plus size={16} />我要起诉</button>
      <button className="court-button" onClick={props.onOpenLobby}><Users size={16} />旁听大厅</button>
      <button className="court-button" onClick={props.onOpenLibrary}><History size={16} />判决库</button>
      <div className="court-more"><button className="court-icon-button" onClick={() => setMore(!more)} aria-label="更多设置" aria-expanded={more}><ChevronDown size={19} /></button>
        {more && <div className="court-more__menu">
          <button onClick={toggleLanguage} title="点击切换语言"><Globe size={16} />语言: {LANG_LABELS[lang]}</button>
          <button onClick={() => { setMore(false); props.onOpenHistory(); }}><History size={16} />本机旧档</button>
          {props.localTools && <>
            <button onClick={() => { setMore(false); props.onOpenCast(); }}><Users size={16} />挑选法官</button>
            <button onClick={() => { setMore(false); props.onOpenConfig(); }}><Settings2 size={16} />Agent 模式</button>
            <button onClick={() => { setMore(false); props.onOpenMultiplayer(); }}><Users size={16} />邀请陪审团</button>
            <button onClick={() => { setMore(false); props.onOpenAgentHub(); }}><Bot size={16} />外部 Agent 接入</button>
          </>}
          <button onClick={() => setBgm(sounds.toggleBGM())}><Music size={16} />{bgm ? '关闭背景乐' : '开启背景乐'}</button>
          <button onClick={() => setMuted(sounds.toggleMute())}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}{muted ? '开启音效' : '关闭音效'}</button>
        </div>}
      </div>
    </nav>
  </div></header>;
};
