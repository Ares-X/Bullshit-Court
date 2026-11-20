import { useId, useRef, useState, type FormEvent } from 'react';
import { Check, Copy, MailOpen } from 'lucide-react';
import type { PublicGame } from '../types/platform';
import { Modal } from './Modal';

function CopyLink({ label, url }: { label: string; url: string }) {
  const id = useId();
  const target = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('copied');
    } catch {
      setStatus('manual');
      target.current?.focus();
      target.current?.select();
    }
  };

  return <div className="party-copy">
    <label htmlFor={id}>{label}</label>
    <div>
      <input id={id} ref={target} value={url} readOnly onFocus={event => event.currentTarget.select()} />
      <button type="button" className="party-submit" onClick={() => void copy()}>{status === 'copied' ? <Check size={16} /> : <Copy size={16} />}{status === 'copied' ? '已复制' : '复制'}</button>
    </div>
    {status === 'manual' && <p role="status">链接已选中，请手动复制。</p>}
  </div>;
}

export function PartyShareModal({ visibility, links, onClose }: {
  visibility: NonNullable<PublicGame['party']>['visibility'];
  links: { room: string; defense?: string };
  onClose: () => void;
}) {
  return <Modal isOpen onClose={onClose} title={links.defense ? '发给朋友应诉' : '分享庭审'} className="party-modal">
    <div className="party-form">
      {links.defense && <>
        <CopyLink label="应诉链接" url={links.defense} />
        <p>把应诉链接发给被告。朋友打开后就能回应，在庭审结束时投一票。</p>
      </>}
      <CopyLink label="旁听链接" url={links.room} />
      <p>{visibility === 'invite' ? '拿到链接的人可以旁听和看判决。' : '这场庭审也可以从旁听大厅打开。'}</p>
    </div>
  </Modal>;
}

export function PartyResponse({ game, busy, error, roomUrl, onRespond }: {
  game: PublicGame;
  busy: boolean;
  error?: string;
  roomUrl?: string;
  onRespond: (stance: string, useAgent: boolean) => Promise<void>;
}) {
  const { caseData } = game.session;
  const [stance, setStance] = useState('');
  const [useAgent, setUseAgent] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!busy && (useAgent || stance.trim())) void onRespond(useAgent ? '' : stance.trim(), useAgent);
  };

  return <section className="party-response" aria-labelledby="party-response-title">
    <header><MailOpen size={24} aria-hidden="true" /><div><h1 id="party-response-title">你被起诉了</h1><p>{caseData.plaintiffName} 诉 {caseData.defendantName}</p></div></header>
    <dl className="party-allegation">
      <div><dt>对方说</dt><dd>{caseData.summary}</dd></div>
      <div><dt>想你怎么办</dt><dd>{caseData.coreClash}</dd></div>
    </dl>
    <form className="party-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <legend>怎么应诉</legend>
        <div className="party-options">
          <label><input type="radio" name="respond-with" checked={!useAgent} onChange={() => setUseAgent(false)} /><span>说一句，法庭替我辩</span></label>
          <label><input type="radio" name="respond-with" checked={useAgent} onChange={() => setUseAgent(true)} /><span>派我的 Agent</span></label>
        </div>
        {!useAgent && <label>你怎么说<textarea rows={2} maxLength={300} required value={stance} onChange={event => setStance(event.target.value)} placeholder="土豆煮烂了，汤才香。" /></label>}
      </fieldset>
      {error && <p className="agent-join-error" role="alert">{error}</p>}
      <div className="party-response-actions">
        <button type="submit" className="party-submit" disabled={busy || (!useAgent && !stance.trim())}>{busy ? '正在应诉…' : useAgent ? '领取出庭邀请' : '提交应诉'}</button>
        {roomUrl && !busy && <a className="platform-text-button" href={roomUrl}>先旁听</a>}
      </div>
    </form>
  </section>;
}
