export type SpeakerRole = 'judge' | 'plaintiff' | 'defendant' | 'jury' | 'clerk';

export type Emotion = 'normal' | 'confident' | 'angry' | 'shocked' | 'smug' | 'sweating' | 'gavel';

export type ShoutType = 'OBJECTION' | 'HOLD_IT' | 'TAKE_THAT' | 'ORDER';

export interface Evidence {
  id: string;
  name: string;
  description: string;
  icon: string;
  owner: 'plaintiff' | 'defendant';
}

export interface AgentProfile {
  id: string;
  name: string;
  model: string;
  persona: string;
  avatar: string;
}

export interface DialogueTurn {
  id: string;
  speaker: SpeakerRole;
  speakerName: string;
  avatar: string;
  text: string;
  emotion: Emotion;
  shout?: ShoutType;
  evidence?: Evidence;
  tiltChange: number; // -25 (pro-defense) to +25 (pro-plaintiff)
  danmaku?: string[];
  agentThought?: string; // Legacy field; live court never creates or displays hidden reasoning.
}

export interface CaseData {
  id: string;
  title: string;
  caseNumber: string;
  category: '美食争端' | '友谊塑料' | '社交礼仪' | '当代玄学' | '猎奇幽默' | '赛博荒诞' | '职场黑洞';
  tags: string[];
  summary: string;
  plaintiffName: string;
  plaintiffTitle: string;
  defendantName: string;
  defendantTitle: string;
  coreClash: string;
  evidences: Evidence[];
  turns: DialogueTurn[];
  plaintiffVerdict: {
    result: string;
    penalty: string[];
    quote: string;
  };
  defendantVerdict: {
    result: string;
    penalty: string[];
    quote: string;
  };
  agents?: {
    plaintiff: AgentProfile;
    defendant: AgentProfile;
    judge: AgentProfile;
  };
}

export type GameStage = 'SELECTION' | 'CASE_BRIEF' | 'TRIAL' | 'JURY_VOTE' | 'VERDICT' | 'CUSTOM_CASE';

export interface JuryState {
  scaleBalance: number; // -100 (Full Defendant) to +100 (Full Plaintiff), 0 is middle
  plaintiffVotes: number;
  defendantVotes: number;
  playerVoted?: 'plaintiff' | 'defendant';
}

export type CourtRole = 'judge' | 'plaintiff' | 'defendant';
export type CourtMode = 'rehearsal' | 'live' | 'external';
export type CourtPhase = 'opening' | 'statements' | 'inquiry' | 'evidence' | 'deliberation' | 'verdict';

/** Connection credentials belong to the caller, never to a persisted CourtSession. */
export interface CourtConnectionConfig {
  apiKey: string;
  apiEndpoint: string;
  modelName: string;
  timeoutMs?: number;
}

export interface CourtRuling {
  winner: 'plaintiff' | 'defendant' | 'draw';
  result: string;
  penalty: string[];
  quote: string;
  reasons: string[];
  evidenceIds: string[];
  consideredInterventionIds: string[];
}

export interface CourtTurn extends DialogueTurn {
  speaker: CourtRole;
  phase: CourtPhase;
  responseTo: string[];
  evidenceIds: string[];
}

export interface CourtInterventionInput {
  kind: 'question' | 'evidence' | 'opinion';
  text: string;
  evidence?: Evidence;
}

export interface CourtIntervention extends CourtInterventionInput {
  id: string;
  timestamp: number;
  afterTurnId?: string;
}

export interface CourtScheduledTurn {
  role: CourtRole;
  phase: CourtPhase;
  interventionIds: string[];
}

export interface CourtSession {
  version: 1;
  id: string;
  mode: CourtMode;
  caseData: CaseData;
  turns: CourtTurn[];
  evidences: Evidence[];
  interventions: CourtIntervention[];
  pendingTurns: CourtScheduledTurn[];
  phase: CourtPhase;
  status: 'active' | 'awaiting-ruling' | 'completed';
  rulingRequested: boolean;
  juryVote?: 'plaintiff' | 'defendant' | 'draw';
  ruling?: CourtRuling;
  appeal?: {
    reason: string;
    role: 'plaintiff' | 'defendant';
    originalSessionId: string;
    originalRuling: CourtRuling;
  };
}
