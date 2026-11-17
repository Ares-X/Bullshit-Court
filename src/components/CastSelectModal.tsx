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
    <Modal isOpen={isOpen} onClose={onClose} title="选择开庭阵容" description="三组二维卡通演员，共五种庭审表情。改变阵容属于赛前设置，不干预正在进行的庭审。" className="cast-select-modal">
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
              <span className="cast-card__status">{selected === cast.id ? '已选中' : '选择此阵容'}</span>
            </button>
          ))}
        </div>
      </div>
      <footer className="court-modal__footer">
        <p>{hasProgress ? '应用后将清空本场进度，使用当前案卷重新开庭。' : '原告与被告仍是案卷中的当事人，演员只改变形象与表达风格。'}</p>
        <button className="court-button court-button--primary" type="button" onClick={() => { onSelect(selected); onClose(); }}>{hasProgress ? '使用阵容并重新开庭' : '使用这组阵容'}</button>
      </footer>
    </Modal>
  );
}
