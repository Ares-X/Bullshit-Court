import type { CourtRole } from '../types';

export const AGENT_GUIDE_PATH = '/agents/guide.md';
export const AGENT_ROLE_LABELS: Record<CourtRole, string> = {
  plaintiff: '原告', defendant: '被告', judge: '法官',
};

export function getAgentRolePath(role: CourtRole): string {
  return `/agents/roles/${role}.md`;
}

/** Invitation text deliberately contains only a short instruction and the issued URL. */
export function buildAgentInvite(joinUrl: string): string {
  const url = new URL(joinUrl);
  if (!['https:', 'http:'].includes(url.protocol) || !/^\/join\/[^/]+$/.test(url.pathname) || url.username || url.password || url.search || url.hash) {
    throw new Error('入场邀请必须使用网站生成的入场链接');
  }
  return `来互联网法庭出庭，按网站规则完成你的角色：${url.href}`;
}
