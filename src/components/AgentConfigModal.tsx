import { useEffect, useState, type FormEvent } from 'react';
import type { CourtConnectionConfig, CourtMode } from '../types';
import { Modal } from './Modal';

interface AgentConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig?: CourtConnectionConfig;
  currentMode?: CourtMode;
  hasProgress?: boolean;
  onApply: (config?: CourtConnectionConfig) => void;
}
const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export function AgentConfigModal({ isOpen, onClose, currentConfig, currentMode = 'rehearsal', hasProgress = false, onApply }: AgentConfigModalProps) {
  const [mode, setMode] = useState<'rehearsal' | 'live'>('rehearsal');
  const [apiEndpoint, setApiEndpoint] = useState(DEFAULT_ENDPOINT);
  const [modelName, setModelName] = useState('gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isOpen) { setApiKey(''); return; }
    setMode(currentConfig || currentMode === 'live' ? 'live' : 'rehearsal');
    setApiEndpoint(currentConfig?.apiEndpoint || DEFAULT_ENDPOINT);
    setModelName(currentConfig?.modelName || 'gpt-4o-mini');
    setApiKey(currentConfig?.apiKey || '');
    setError('');
  }, [isOpen, currentConfig, currentMode]);
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'rehearsal') { setApiKey(''); onApply(undefined); onClose(); return; }
    if (!apiKey.trim() || !modelName.trim() || !apiEndpoint.trim()) { setError('请填写接口地址、模型名称和 API Key。'); return; }
    try {
      const url = new URL(apiEndpoint.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /[?#]/.test(apiEndpoint)) throw new Error();
    } catch { setError('接口须为 HTTP 或 HTTPS 完整地址，不得含用户名、密码、查询参数或片段。'); return; }
    onApply({ apiKey: apiKey.trim(), apiEndpoint: apiEndpoint.trim(), modelName: modelName.trim(), ...(currentConfig?.timeoutMs ? { timeoutMs: currentConfig.timeoutMs } : {}) });
    setApiKey('');
    onClose();
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Agent 辩护配置" description="可接入外部大模型 API，让控辩双方与法官实时交锋推理。" className="agent-config-modal">
      <form onSubmit={handleSubmit} className="agent-config-form">
        <fieldset className="agent-mode-selector">
          <legend>庭审驱动模式</legend>
          <label><input type="radio" name="court-mode" value="rehearsal" checked={mode === 'rehearsal'} onChange={() => { setMode('rehearsal'); setApiKey(''); setError(''); }} /><span><strong>单机剧本排练（无需 Key）</strong><small>本地预置推演，秒开即演，无需消耗任何 API 配额。</small></span></label>
          <label><input type="radio" name="court-mode" value="live" checked={mode === 'live'} onChange={() => { setMode('live'); setError(''); }} /><span><strong>实时大模型对辩（需 API Key）</strong><small>原告、被告与法官各自连入大模型，按轮次唇枪舌剑。</small></span></label>
        </fieldset>
        {mode === 'live' && <div className="agent-connection-fields">
          <label htmlFor="court-endpoint">API 接口地址 (Base URL)</label>
          <input id="court-endpoint" type="url" required value={apiEndpoint} onChange={event => setApiEndpoint(event.target.value)} placeholder={DEFAULT_ENDPOINT} autoComplete="off" spellCheck={false} />
          <label htmlFor="court-model">模型名称</label>
          <input id="court-model" type="text" required value={modelName} onChange={event => setModelName(event.target.value)} autoComplete="off" spellCheck={false} />
          <label htmlFor="court-api-key">API Key</label>
          <input id="court-api-key" type="password" required value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="off" spellCheck={false} />
          <p>每次发言由对应角色调用模型，凭据仅保存在当前会话内存，刷新即毁，绝不上传服务器或写入本地案卷。</p>
        </div>}
        <p className="agent-config-note">台上两个 Agent 疯狂争辩，主审法官坐镇主持。台下的你作为真人陪审，一票定胜负！</p>
        {error && <p className="agent-config-error" role="alert">{error}</p>}
        <footer className="court-modal__footer">
          <button type="button" className="court-button" onClick={onClose}>取消</button>
          <button type="submit" className="court-button court-button--primary">{mode === 'live' && currentMode === 'live' && hasProgress ? '保存设置并继续庭审' : '保存并重新开庭'}</button>
        </footer>
      </form>
    </Modal>
  );
}
