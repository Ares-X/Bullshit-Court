import type { CourtRole } from '../types';
import type { GameCard, PlatformMode, PublicGame, PublicSeat } from '../types/platform';

/**
 * Slim projection of a PublicGame for lobby and judgment listings.
 * The full session is only fetched from the game's own endpoint (`/games/:id`),
 * so list endpoints never ship every turn's text.
 */
export function toGameCard(game: PublicGame): GameCard {
  const seats = Object.fromEntries((Object.keys(game.seats) as CourtRole[]).map(role => {
    const seat: PublicSeat = game.seats[role];
    return [role, seat];
  })) as Record<CourtRole, PublicSeat>;
  return {
    id: game.id, mode: game.mode as PlatformMode, status: game.status,
    createdAt: game.createdAt, updatedAt: game.updatedAt,
    title: game.session.caseData.title,
    plaintiffName: game.session.caseData.plaintiffName,
    defendantName: game.session.caseData.defendantName,
    category: game.session.caseData.category,
    seats, jury: game.jury, turnCount: game.session.turns.length,
    ...(game.audience ? { audience: {
      seated: game.audience.seated, required: game.audience.required,
      ...(game.audience.publicJurors !== undefined ? { publicJurors: game.audience.publicJurors, canJoin: game.audience.canJoin } : {}),
    } } : {}),
    ...(game.party ? { party: game.party } : {}),
    ...(game.session.ruling ? { ruling: { winner: game.session.ruling.winner, ...(game.session.ruling.quote ? { quote: game.session.ruling.quote } : {}), result: game.session.ruling.result } } : {}),
  };
}

/** Lowercased blob used by the judgment library search on both Node and D1. */
export function gameCardSearchBlob(card: GameCard): string {
  return [card.title, card.plaintiffName, card.defendantName, card.category || '',
    card.ruling?.quote || '', card.ruling?.result || ''].join('\n').toLowerCase();
}
