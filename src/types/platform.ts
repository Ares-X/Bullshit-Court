import type { CaseData, CourtRole, CourtSession } from './index';

export type PlatformMode = 'practice' | 'multiplayer';
export type JuryWinner = 'plaintiff' | 'defendant';
export interface PublicSeat {
  role: CourtRole;
  source: 'practice' | 'external';
  status: 'practice' | 'open' | 'reserved' | 'claimed';
  agentName?: string;
}
export interface PublicGame {
  id: string;
  mode: PlatformMode;
  revision: number;
  createdAt: number;
  updatedAt: number;
  status: 'waiting-agents' | 'running' | 'waiting-jury' | 'completed' | 'unresolved';
  session: CourtSession;
  seats: Record<CourtRole, PublicSeat>;
  currentTurnId: string | null;
  currentRole: CourtRole | null;
  guidePath: string;
  jury: {
    plaintiffVotes: number;
    defendantVotes: number;
    total: number;
    minimumVotes: number;
    deadlineAt?: number;
    outcome: 'pending' | JuryWinner | 'unresolved';
  };
  verdict: { prepared: boolean; preparedAt?: number; publishedAt?: number; source?: 'practice' | 'external' };
}
export interface AgentState {
  game: PublicGame;
  role: CourtRole;
  roleFinished: boolean;
  canSubmit: boolean;
  turnId: string | null;
  expectedRevision: number;
  action: 'wait' | 'submit_turn' | 'prepare_verdicts' | 'finished';
  guidePath: string;
  rolePromptPath: string;
  receipts: {clientActionId: string; kind: string; acceptedTurnId?: string; prepared?: boolean}[];
}
export interface GameInvitation { ticket: string; role: CourtRole; path: string }
export interface CreateGameInput { caseData: CaseData; role: CourtRole; mode?: PlatformMode; clientActionId?: string }
export interface CreateGameResult { game: PublicGame; ownerToken: string; invitation: GameInvitation }
export interface AgentTurnInput { turnId: string; revision: number; clientActionId: string; payload: unknown }
export interface PrepareVerdictsInput { clientActionId: string; plaintiff: unknown; defendant: unknown; revision?: number }
