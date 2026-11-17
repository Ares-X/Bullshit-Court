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
    <Modal isOpen={isOpen} onClose={onClose} title="三 Agent 配置" description="实时庭审可补回连接设置后继续；切换模式会使用当前案卷重新开庭。" className="agent-config-modal">
      <form onSubmit={handleSubmit} className="agent-config-form">
        <fieldset className="agent-mode-selector">
          <legend>庭审模式</legend>
          <label><input type="radio" name="court-mode" value="rehearsal" checked={mode === 'rehearsal'} onChange={() => { setMode('rehearsal'); setApiKey(''); setError(''); }} /><span><strong>排练（无需 Key）</strong><small>本地规则生成，不是真实模型运行。</small></span></label>
          <label><input type="radio" name="court-mode" value="live" checked={mode === 'live'} onChange={() => { setMode('live'); setError(''); }} /><span><strong>实时三 Agent</strong><small>法官、原告和被告分别读取共同庭审记录。</small></span></label>
        </fieldset>
        {mode === 'live' && <div className="agent-connection-fields">
          <label htmlFor="court-endpoint">API 接口地址</label>
          <input id="court-endpoint" type="url" required value={apiEndpoint} onChange={event => setApiEndpoint(event.target.value)} placeholder={DEFAULT_ENDPOINT} autoComplete="off" spellCheck={false} />
          <label htmlFor="court-model">模型名称</label>
          <input id="court-model" type="text" required value={modelName} onChange={event => setModelName(event.target.value)} autoComplete="off" spellCheck={false} />
          <label htmlFor="court-api-key">API Key</label>
          <input id="court-api-key" type="password" required value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="off" spellCheck={false} />
          <p>每回合发起一次模型调用，可能由你的服务商计费。保存配置不会发起调用。凭据仅保存在当前页面内存，刷新后清除，不写入历史案卷。</p>
        </div>}
        <p className="agent-config-note">三个 Agent 自行陈述、举证和质询。真人庭审只做陪审投票，法官根据票决宣读娱乐裁决。</p>
        {error && <p className="agent-config-error" role="alert">{error}</p>}
        <footer className="court-modal__footer">
          <button type="button" className="court-button" onClick={onClose}>取消</button>
          <button type="submit" className="court-button court-button--primary">{mode === 'live' && currentMode === 'live' && hasProgress ? '保存设置并继续庭审' : '保存并重新开庭'}</button>
        </footer>
      </form>
    </Modal>
  );
}
