import { useEffect, useState } from 'react';
import type { CourtRole } from '../types';
import { type CourtCast, type CourtExpression } from '../data/courtCasts';

export interface CharacterPortraitProps {
  role: CourtRole;
  cast: CourtCast;
  expression: CourtExpression;
  className?: string;
  label?: string;
}
export const EXPRESSION_LABELS: Record<CourtExpression, string> = {
  neutral: '平静', speaking: '发言', questioning: '质询', confident: '自信', shocked: '震惊',
};
const ROLE_NAMES: Record<CourtRole, string> = { judge: '法官', plaintiff: '原告', defendant: '被告' };

export function CharacterPortrait({ role, cast, expression, className = '', label }: CharacterPortraitProps) {
  const judgePortrait = role === 'judge' ? cast.judgePortrait : undefined;
  const asset = judgePortrait?.asset ?? cast.asset;
  const atlas = judgePortrait ?? cast.atlas;
  const [failedAsset, setFailedAsset] = useState<string>();
  useEffect(() => {
    let active = true;
    const image = new Image();
    image.onerror = () => { if (active) setFailedAsset(asset); };
    image.onload = () => { if (active) setFailedAsset(undefined); };
    image.src = asset;
    return () => { active = false; image.onerror = null; image.onload = null; };
  }, [asset]);
  const name = label || (role === 'judge' ? cast.judgeName : ROLE_NAMES[role]);
  const failed = failedAsset === asset;
  const frame = judgePortrait?.frames[expression] ?? cast.atlas.frames[expression][role];
  const extent = Math.max(frame.width, frame.height);
  // Fit this measured rectangular frame into a square slot without stretching it.
  // Background percentages refer to the difference between full atlas and frame size.
  const frameStyle = {
    width: `${frame.width / extent * 100}%`,
    height: `${frame.height / extent * 100}%`,
    backgroundImage: `url("${asset}")`,
    backgroundSize: `${atlas.width / frame.width * 100}% ${atlas.height / frame.height * 100}%`,
    backgroundPosition: `${frame.x / (atlas.width - frame.width) * 100}% ${frame.y / (atlas.height - frame.height) * 100}%`,
    backgroundRepeat: 'no-repeat',
    imageRendering: judgePortrait ? 'pixelated' as const : undefined,
  };
  return (
    <div
      role="img"
      aria-label={`${name}，${EXPRESSION_LABELS[expression]}表情${failed ? '，角色图片暂不可用' : ''}`}
      className={`character-portrait ${failed ? 'character-portrait--unavailable' : ''} ${className}`}
      style={{ aspectRatio: '1' }}
    >
      {!failed && <div className="character-portrait__frame" aria-hidden="true" style={frameStyle} />}
      {failed && <span className="character-portrait__fallback">{name} · {EXPRESSION_LABELS[expression]}<small>角色图片暂不可用</small></span>}
    </div>
  );
}
