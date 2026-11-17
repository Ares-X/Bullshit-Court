import { CaseData } from '../types';

export interface CustomCaseInput {
  title: string;
  plaintiffName: string;
  defendantName: string;
  story: string;
}

/** Records the submitted facts only. No testimony, evidence or verdict is invented. */
export function generateProceduralCase(input: CustomCaseInput): CaseData {
  const title = input.title.trim();
  const story = input.story.trim();
  if (!title || !story) throw new Error('请填写案由和事实经过。');
  const id = `custom-${crypto.randomUUID()}`;
  const plaintiffName = input.plaintiffName.trim() || '原告';
  const defendantName = input.defendantName.trim() || '被告';
  const pendingVerdict = {
    result: '尚未裁决',
    penalty: [],
    quote: '双方陈述后，由真人陪审投票，法官宣读裁决。',
  };
  return {
    id,
    title,
    caseNumber: `【互庭立字第${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${id.slice(-8)}号】`,
    category: '社交礼仪',
    tags: ['真人立案', '待开庭'],
    summary: story,
    plaintiffName,
    plaintiffTitle: '原告本人',
    defendantName,
    defendantTitle: '被告本人',
    coreClash: `围绕“${title}”，请双方说明事实、诉求与分歧。立案陈述尚待质证。`,
    evidences: [],
    turns: [],
    plaintiffVerdict: { ...pendingVerdict },
    defendantVerdict: { ...pendingVerdict },
    agents: {
      plaintiff: { id: `${id}-plaintiff`, name: plaintiffName, model: '待连接', persona: '你是原告本人，以第一人称说明自己经历的事实与诉求；不得编造证据。', avatar: '👩‍💼' },
      defendant: { id: `${id}-defendant`, name: defendantName, model: '待连接', persona: '你是被告本人，以第一人称回应具体指控；未表明的态度与事实不能擅自承认。', avatar: '👨‍💼' },
      judge: { id: `${id}-judge`, name: '赛博破事大法官', model: '待连接', persona: '主持双方本人陈述与互相质询；区分主张与已证事实；根据真人陪审投票宣读裁决。', avatar: '👨‍⚖️' },
    },
  };
}
