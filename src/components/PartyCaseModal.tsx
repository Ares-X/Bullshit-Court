import { useRef, useState, type FormEvent } from 'react';
import type { CaseData } from '../types';
import type { CreateGameInput } from '../types/platform';
import { PRESET_CASES } from '../data/presetCases';
import { generateProceduralCase } from '../utils/aiGenerator';
import { Modal } from './Modal';

type Party = NonNullable<CreateGameInput['party']>;

interface PartyCaseModalProps {
  preset?: CaseData;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (input: CreateGameInput) => Promise<void>;
}

export function PartyCaseModal({ preset: initialPreset, busy, error, onClose, onSubmit }: PartyCaseModalProps) {
  const [preset, setPreset] = useState(initialPreset);
  const [who, setWho] = useState(initialPreset?.defendantName ?? '');
  const [story, setStory] = useState(initialPreset?.summary ?? '');
  const [demand, setDemand] = useState(initialPreset?.plaintiffVerdict.penalty[0] ?? '');
  const [defendant, setDefendant] = useState<Party['defendant']>('builtin');
  const [visibility, setVisibility] = useState<Party['visibility']>('invite');
  const [plaintiff, setPlaintiff] = useState<Party['plaintiff']>('builtin');
  const [defense, setDefense] = useState('');
  const [draftError, setDraftError] = useState<string>();
  const lastSubmission = useRef<{ details: string; caseData: CaseData }>();

  const choosePreset = (id: string) => {
    const next = PRESET_CASES.find(item => item.id === id);
    setPreset(next);
    if (!next) return;
    setWho(next.defendantName);
    setStory(next.summary);
    setDemand(next.plaintiffVerdict.penalty[0] ?? '');
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const defendantName = who.trim();
    const allegation = story.trim();
    const request = demand.trim();
    if (!defendantName || !allegation || !request) {
      setDraftError('请把被告、经过和诉求写清楚。');
      return;
    }

    const stance = defense.trim();
    const party = { defendant, visibility, plaintiff, demand: request, defense: defendant === 'builtin' && stance ? stance : undefined };
    const details = JSON.stringify([preset?.id, defendantName, allegation, party]);
    if (lastSubmission.current?.details !== details) {
      const subject = allegation.split(/[。！？\n]/, 1)[0].trim() || allegation;
      const title = allegation === preset?.summary ? preset.title : `${defendantName}：${[...subject].slice(0, 28).join('')}${[...subject].length > 28 ? '…' : ''}`;
      const caseData = generateProceduralCase({
        title,
        story: allegation,
        plaintiffName: preset?.plaintiffName ?? '起诉人',
        defendantName,
      });
      caseData.coreClash = request;
      if (preset) caseData.category = preset.category;
      lastSubmission.current = { details, caseData };
    }
    setDraftError(undefined);
    void onSubmit({ caseData: lastSubmission.current.caseData, role: 'plaintiff', mode: defendant === 'friend' ? 'multiplayer' : 'practice', party });
  };

  return <Modal isOpen onClose={onClose} title="我要起诉" className="party-modal">
    <form className="party-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label className="party-preset"><span>现成案子（可选）</span><select value={preset?.id ?? ''} onChange={event => choosePreset(event.target.value)}>
          <option value="">自己写</option>
          {PRESET_CASES.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></label>
        <label>告谁<input required maxLength={60} value={who} onChange={event => setWho(event.target.value)} placeholder="对方的昵称" /></label>
        <label>什么事<textarea required rows={3} maxLength={1000} value={story} onChange={event => setStory(event.target.value)} placeholder="他在火锅里煮了四十五分钟的土豆，把锅底煮成了泥。" /></label>
        <label>想他怎么办<input required maxLength={300} value={demand} onChange={event => setDemand(event.target.value)} placeholder="下次把土豆放到自己那一格。" /></label>
      </fieldset>

      <fieldset disabled={busy}>
        <legend>谁来应诉</legend>
        <div className="party-options">
          <label><input type="radio" name="defendant" checked={defendant === 'builtin'} onChange={() => setDefendant('builtin')} /><span>法庭替他辩</span></label>
          <label><input type="radio" name="defendant" checked={defendant === 'friend'} onChange={() => setDefendant('friend')} /><span>请朋友应诉</span></label>
        </div>
        {defendant === 'builtin' && <label>对方会怎么说（可选）<input maxLength={300} value={defense} onChange={event => setDefense(event.target.value)} placeholder="土豆煮烂了，汤才香。" /></label>}
      </fieldset>

      <fieldset disabled={busy} aria-describedby="party-visibility-note">
        <legend>谁能旁听</legend>
        <div className="party-options">
          <label><input type="radio" name="visibility" checked={visibility === 'invite'} onChange={() => setVisibility('invite')} /><span>仅持链接的人</span></label>
          <label><input type="radio" name="visibility" checked={visibility === 'public'} onChange={() => setVisibility('public')} /><span>所有人</span></label>
        </div>
        <p id="party-visibility-note">{visibility === 'invite' ? '案卷只通过链接打开。' : '庭审会出现在大厅，结束后进入公开判决库。'}</p>
      </fieldset>

      <details className="party-more">
        <summary>谁替你出庭</summary>
        <fieldset disabled={busy} aria-label="谁替你出庭">
          <div className="party-options">
            <label><input type="radio" name="plaintiff" checked={plaintiff === 'builtin'} onChange={() => setPlaintiff('builtin')} /><span>法庭替我辩</span></label>
            <label><input type="radio" name="plaintiff" checked={plaintiff === 'external'} onChange={() => setPlaintiff('external')} /><span>派我的 Agent</span></label>
          </div>
        </fieldset>
      </details>
      {(draftError || error) && <p className="agent-join-error" role="alert">{draftError || error}</p>}
      <button type="submit" className="party-submit" disabled={busy}>{busy ? '正在立案…' : defendant === 'friend' ? '立案并邀请朋友' : '提交起诉'}</button>
    </form>
  </Modal>;
}
