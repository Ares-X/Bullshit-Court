import type { CaseData, CourtRole, CourtSession } from './index';

export type PlatformMode = 'practice' | 'multiplayer';
export type JuryWinner = 'plaintiff' | 'defendant';
export type JuryProp = 'tomato' | 'flipflop' | 'egg' | 'popcorn' | 'flower';
export type JuryReactionInput = { kind: 'prop'; prop: JuryProp } | { kind: 'message'; text: string };
export type JuryReaction = (
  { kind: 'prop'; prop: JuryProp; target: CourtRole } | { kind: 'message'; text: string }
) & { id: number };
export interface CourtCapabilities { builtinJudge: boolean }
export interface PartyRoomInput {
  visibility: 'public' | 'invite';
  plaintiff: 'builtin' | 'external';
  defendant: 'builtin' | 'friend';
  demand: string;
  defense?: string;
}
export interface PublicSeat {
  role: CourtRole;
  source: 'practice' | 'external' | 'builtin';
  status: 'practice' | 'open' | 'reserved' | 'claimed' | 'builtin';
  agentName?: string;
}
export interface PublicGame {
  id: string;
  mode: PlatformMode;
  revision: number;
  createdAt: number;
  updatedAt: number;
  status: 'waiting-agents' | 'waiting-jurors' | 'running' | 'waiting-jury' | 'waiting-verdict' | 'completed' | 'unresolved';
  session: CourtSession;
  seats: Record<CourtRole, PublicSeat>;
  currentTurnId: string | null;
  currentRole: CourtRole | null;
  guidePath: string;
  party?: Pick<PartyRoomInput, 'visibility' | 'defendant'>;
  audience?: { seated: number; required: number; reactions: JuryReaction[] };
  jury: {
    plaintiffVotes: number;
    defendantVotes: number;
    total: number;
    minimumVotes: number;
    deadlineAt?: number;
    outcome: 'pending' | JuryWinner | 'draw' | 'unresolved';
  };
  verdict: { flow?: 'post-jury' | 'prepared'; prepared: boolean; preparedAt?: number; publishedAt?: number; source?: PublicSeat['source'] };
}
export interface AgentState {
  game: PublicGame;
  role: CourtRole;
  position?: string;
  roleFinished: boolean;
  canSubmit: boolean;
  turnId: string | null;
  expectedRevision: number;
  action: 'wait' | 'submit_turn' | 'submit_verdict' | 'prepare_verdicts' | 'finished';
  guidePath: string;
  rolePromptPath: string;
  receipts: {clientActionId: string; kind: string; acceptedTurnId?: string; prepared?: boolean}[];
}
/** Slim listing projection: enough for lobby cards and judgment cards, no turn text. */
export interface GameCard {
  id: string;
  mode: PlatformMode;
  status: PublicGame['status'];
  createdAt: number;
  updatedAt: number;
  title: string;
  plaintiffName: string;
  defendantName: string;
  category?: string;
  seats: Record<CourtRole, PublicSeat>;
  jury: PublicGame['jury'];
  audience?: Pick<NonNullable<PublicGame['audience']>, 'seated' | 'required'>;
  party?: PublicGame['party'];
  turnCount: number;
  ruling?: { winner: 'plaintiff' | 'defendant' | 'draw'; quote?: string; result: string };
}
export interface GameInvitation { ticket: string; role: CourtRole; path: string }
export interface CreateGameInput {
  caseData: CaseData;
  role: CourtRole;
  mode?: PlatformMode;
  clientActionId?: string;
  judgeMode?: 'external' | 'builtin';
  judgeCastId?: string;
  party?: PartyRoomInput;
}
export interface CreateGameResult {
  game: PublicGame;
  ownerToken: string;
  invitation?: GameInvitation;
  roomKey?: string;
  defenseInvitation?: GameInvitation;
}
export interface AgentTurnInput { turnId: string; revision: number; clientActionId: string; payload: unknown }
export interface PrepareVerdictsInput { clientActionId: string; plaintiff: unknown; defendant: unknown; revision?: number }

export interface JudgmentPage { games: GameCard[]; nextCursor?: string }
export type InvitationContext = AgentState | {
  game: PublicGame; gameId: string; role: CourtRole; claimed: false; action: 'claim';
  guidePath: string; rolePromptPath: string; claimPath: string; position?: string;
};
/** Agent-authored JSON carried by the seat owner's browser to the existing mutation endpoints. */
export type RelayCourtAction = {
  gameId: string; role: CourtRole; turnId: string | null; revision: number; clientActionId: string;
} & ({ courtAction: 'turn'; payload: unknown } | { courtAction: 'verdicts'; plaintiff: unknown; defendant: unknown });
