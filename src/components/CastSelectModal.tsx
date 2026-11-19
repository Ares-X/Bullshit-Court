import { useEffect, useState } from 'react';
import { COURT_CASTS, type CourtExpression } from '../data/courtCasts';
import type { CourtRole } from '../types';
import { CharacterPortrait, EXPRESSION_LABELS } from './CharacterPortrait';
import { Modal } from './Modal';

interface CastSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCastId: string;
  onSelect: (castId: string) => void;
  hasProgress?: boolean;
}
const EXPRESSIONS: CourtExpression[] = ['neutral', 'speaking', 'questioning', 'confident', 'shocked'];
const ROLES: CourtRole[] = ['plaintiff', 'judge', 'defendant'];
const LABELS: Record<CourtRole, string> = { judge: '法官', plaintiff: '原告本人', defendant: '被告本人' };

export function CastSelectModal({ isOpen, onClose, currentCastId, onSelect, hasProgress }: CastSelectModalProps) {
  const [selected, setSelected] = useState(currentCastId);
  const [expression, setExpression] = useState<CourtExpression>('neutral');
  useEffect(() => {
    if (isOpen) { setSelected(currentCastId); setExpression('neutral'); }
  }, [isOpen, currentCastId]);
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="挑选出庭演员阵容" description="三套像素神仙班底，各带丰富颜艺！换批演员，给案子换个画风与嗓音。" className="cast-select-modal">
      <div className="cast-select-modal__body">
        <div className="expression-selector" role="group" aria-label="预览人物表情">
          {EXPRESSIONS.map(value => <button key={value} type="button" aria-pressed={expression === value} onClick={() => setExpression(value)}>{EXPRESSION_LABELS[value]}</button>)}
        </div>
        <div className="cast-grid" role="group" aria-label="开庭阵容">
          {COURT_CASTS.map(cast => (
            <button key={cast.id} type="button" className={`cast-card ${selected === cast.id ? 'cast-card--selected' : ''}`} aria-pressed={selected === cast.id} onClick={() => setSelected(cast.id)}>
              <span className="cast-card__portraits">
                {ROLES.map(role => <span className="cast-card__role" key={role}><CharacterPortrait role={role} cast={cast} expression={expression} /><span>{LABELS[role]}</span></span>)}
              </span>
              <strong>{cast.name}</strong>
              <span className="cast-card__description">{cast.description}</span>
              <span className="cast-card__status">{selected === cast.id ? '当前选用' : '换用此班底'}</span>
            </button>
          ))}
        </div>
      </div>
      <footer className="court-modal__footer">
        <p>{hasProgress ? '更替演员将重置当场进度，使用新班底重新击槌开庭。' : '当事人身份不变，演员将带来全新的面部颜艺与配音音色。'}</p>
        <button className="court-button court-button--primary" type="button" onClick={() => { onSelect(selected); onClose(); }}>{hasProgress ? '换角并重新开庭' : '确认选用此班底'}</button>
      </footer>
    </Modal>
  );
}
