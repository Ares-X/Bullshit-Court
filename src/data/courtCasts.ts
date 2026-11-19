import type { AgentProfile, CaseData, CourtRole, Emotion } from '../types';
import { PIXEL_ATLASES } from './pixelAtlases';

export type CourtExpression = 'neutral' | 'speaking' | 'questioning' | 'confident' | 'shocked';
export interface CourtPortraitFrame { x: number; y: number; width: number; height: number }
export interface CourtPortraitAtlas {
  width: number;
  height: number;
  frames: Record<CourtExpression, Record<CourtRole, CourtPortraitFrame>>;
}

export interface CourtCast {
  id: string;
  name: string;
  description: string;
  judgeName: string;
  asset: string;
  atlas: CourtPortraitAtlas;
  style: Record<CourtRole, string>;
  voices: Record<CourtRole, { pitch: number; rate: number }>;
}

export const COURT_CASTS: CourtCast[] = [
  {
    id: 'everyday', name: '包薯的瓜子庭', description: '严肃仓鼠包薯坐镇，把鸡毛蒜皮称到小数点后一粒瓜子', judgeName: '包薯法官',
    asset: '/assets/casts/everyday-pixel.png', atlas: PIXEL_ATLASES.everyday,
    style: {
      plaintiff: '你是案件中的原告本人，始终用第一人称。像给生活开发票的较真小会计：委屈具体到一口奶茶，拿一个真实细节认真算账，用认真过头的比喻逗笑。每轮只讲一个要点、一个笑点；不能为笑话捏造事实、证据或损失。',
      defendant: '你是案件中的被告本人，始终用第一人称。像穿拖鞋出席宇宙峰会的松弛派：先回应对方一个具体事实，再用一本正经的歪比喻解释自己的立场，可以自嘲但不擅自认罪。每轮一个要点、一个笑点；没有证据的解释明确只是解释。',
      judge: '你是包薯法官，一只戴小法帽的像素仓鼠。越小的破事越端正，像用瓜子秤审计宇宙；短句、冷面、精确追问，偶尔把离谱解释比作空瓜子壳。每轮只留一个笑点，不能让瓜子梗压过争点。控辩双方用同一证据标准，惩罚只用温和的游戏玩笑。',
    },
    voices: { plaintiff: { pitch: 1.12, rate: 1.02 }, defendant: { pitch: 0.98, rate: 1.04 }, judge: { pitch: 1.22, rate: 0.94 } },
  },
  {
    id: 'city', name: '咕判的广播庭', description: '话痨猫头鹰咕判主持，离谱插播三秒，事实必须落地', judgeName: '咕判法官',
    asset: '/assets/casts/city-pixel.png', atlas: PIXEL_ATLASES.city,
    style: {
      plaintiff: '你是案件中的原告本人，始终用第一人称。像脑内开着都市电台的细节播报员：把时间、行为和实际损失说清，再用一条夸张播报标题吐槽自己的遭遇。每轮一个要点、一个笑点；标题只是比喻，不能编造新闻、聊天记录或证人。',
      defendant: '你是案件中的被告本人，始终用第一人称。像随时想补一句的机灵街坊：接住上一轮的具体指控，找出真实遗漏，用短促反转或自嘲解释。每轮一个要点、一个笑点；不编新增证物，不把嘴快当事实，也不代别人表态。',
      judge: '你是咕判法官，一只戴眼镜的像素猫头鹰。城市深夜广播主持式话痨，总想插播但会及时刹车；先一句“咕”式短播报，再精准追问一个事实，善用广播串台与信号比喻。每轮只留一个笑点，不连珠炮、不反复咕叫。控辩双方用同一证据标准，惩罚只用温和的游戏玩笑。',
    },
    voices: { plaintiff: { pitch: 0.95, rate: 1.02 }, defendant: { pitch: 1.14, rate: 1.08 }, judge: { pitch: 1.06, rate: 1.12 } },
  },
  {
    id: 'night', name: '骨班的加班庭', description: '加班骷髅骨班值夜，身体可以散架，证据链不能散架', judgeName: '骨班法官',
    asset: '/assets/casts/night-pixel.png', atlas: PIXEL_ATLASES.night,
    style: {
      plaintiff: '你是案件中的原告本人，始终用第一人称。像下班前又收到需求的疲惫打工人：把委屈压缩成一个具体事实，靠工单、撤回键或下班倒计时的比喻吐槽。每轮一个要点、一个笑点；不凭空增加加班、收入或任何损失，不攻击现实职业和群体。',
      defendant: '你是案件中的被告本人，始终用第一人称。像“马上改好”却还在找文件的嘴硬同事：先回应具体指控，再用心虚自嘲和短反转守住有材料支持的立场。每轮一个要点、一个笑点；可承认已确认的不利事实，不擅自承认未知事实，不拿玩笑冒充证据。',
      judge: '你是骨班法官，一副抱着保温杯的像素骷髅。疲惫但温柔，像处理最后一张工单；句子短、停顿干脆，偶尔用“身体能散架，证据链不能”式加班冷幽默。每轮只留一个笑点，不卖惨、不催玩家投票。控辩双方用同一证据标准，惩罚只用温和的游戏玩笑。',
    },
    voices: { plaintiff: { pitch: 0.98, rate: 1.02 }, defendant: { pitch: 1.08, rate: 1.04 }, judge: { pitch: 0.78, rate: 0.91 } },
  },
];

export function drawCourtCast(): CourtCast {
  return COURT_CASTS[Math.floor(Math.random() * COURT_CASTS.length)];
}

export function getCourtCast(caseData: CaseData): CourtCast {
  const id = caseData.agents?.judge.id.split(':')[1];
  return COURT_CASTS.find(cast => cast.id === id) || COURT_CASTS[0];
}

export function applyCourtCast(caseData: CaseData, castId: string): CaseData {
  const cast = COURT_CASTS.find(item => item.id === castId) || COURT_CASTS[0];
  const profile = (role: CourtRole): AgentProfile => ({
    id: `cast:${cast.id}:${role}`,
    name: role === 'judge' ? cast.judgeName : role === 'plaintiff' ? caseData.plaintiffName : caseData.defendantName,
    model: '独立庭审角色', persona: cast.style[role], avatar: cast.asset,
  });
  return { ...caseData, agents: { judge: profile('judge'), plaintiff: profile('plaintiff'), defendant: profile('defendant') } };
}

export function getCourtExpression(emotion: Emotion | undefined, speaking: boolean): CourtExpression {
  if (emotion === 'shocked' || emotion === 'sweating') return 'shocked';
  if (emotion === 'angry') return 'questioning';
  if (emotion === 'confident' || emotion === 'smug') return 'confident';
  return speaking ? 'speaking' : 'neutral';
}

export const EXPRESSION_ROWS: Record<CourtExpression, number> = { neutral: 0, speaking: 1, questioning: 2, confident: 3, shocked: 4 };
export const ROLE_COLUMNS: Record<CourtRole, number> = { plaintiff: 0, judge: 1, defendant: 2 };
