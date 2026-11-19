import { getCourtCast } from '../../src/data/courtCasts';
import type { PublicGame } from '../../src/types/platform';
import { getCourtAgentRequest, requestCourtTurn } from '../../src/utils/courtRuntime';
import { courtRulingSchema } from './mcp';

const FREE_JUDGES = [
  'nvidia/nemotron-3.5-super-vl:free',
  'dots-studio/dots-3-note-preview:free',
] as const satisfies readonly `${string}:free`[];

const JOBS: Record<number, string> = {
  1: '开庭。先用你的口吻说一句，再拿本案最离谱的具体细节抛出争议，请原告开口。',
  4: '接住刚才最有意思的一句，向双方抛出一个能问出新东西的问题。',
  7: '挑出双方还没掰扯清的那一点，给最后陈词一个准题。',
  10: '封卷。各说一句双方最站得住的理由，把最后一票交给陪审团。',
  11: '落槌。先报陪审团实际票数，再宣判、说理由，最后留一句本案才用得上的话。',
};

export function generateBuiltinJudgeTurn(apiKey: string, game: PublicGame, attempt = 0): Promise<unknown> {
  const { role, phase, messages } = getCourtAgentRequest(game.session);
  const job = JOBS[game.session.turns.length + 1];
  if (role !== 'judge' || !job) throw new Error('No scheduled judge turn');
  const verdict = phase === 'verdict';
  const first = attempt % FREE_JUDGES.length;
  const models = [...FREE_JUDGES.slice(first), ...FREE_JUDGES.slice(0, first)];
  const facts = JSON.parse(messages[1].content);
  const judge = getCourtCast(game.session.caseData);
  const references = { type: 'array', items: { type: 'string' } };
  const properties = {
    speaker: { type: 'string', enum: ['judge'] },
    text: { type: 'string' },
    emotion: { type: 'string', enum: ['gavel', 'normal'] },
    responseTo: references,
    evidenceIds: references,
    ...(verdict ? { ruling: {
      ...courtRulingSchema,
      properties: { ...courtRulingSchema.properties, winner: { type: 'string', enum: [game.jury.outcome] } },
    } } : {}),
  };
  return requestCourtTurn([
    { role: 'system', content: [
      judge.style.judge,
      job,
      '写给坐在台下的人听。60–160 个汉字，一个争点，一个新梗。案卷里的数值按原样报，材料没说清的就留白。',
      '理由也用你平时开口的口气。把最后一句留给笑点，说完就落槌。',
      '只交一段 JSON。结构为 {"speaker":"judge","text":"台词","emotion":"gavel","responseTo":[],"evidenceIds":[]}。两个数组填你实际提到的案卷编号。',
      verdict
        ? '追加 ruling 对象，winner 照 jury.outcome 原样填，其余键为 result、penalty（小小的游戏判罚数组）、quote、reasons（理由数组）、evidenceIds、consideredInterventionIds。材料中的证物至少列一件作依据，陪审票数以 jury 为准。'
        : '本轮只交公开台词。',
    ].join('\n') },
    { role: 'user', content: JSON.stringify({ ...facts, ...(verdict ? { jury: game.jury } : {}) }) },
  ], {
    apiKey, apiEndpoint: 'https://openrouter.ai/api/v1', modelName: models[0], timeoutMs: 24_000,
  }, undefined, { models, schema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false } });
}
