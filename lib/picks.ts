// Pick submission rules.
//
// Pure, so the dangerous parts can be tested without a database. The route
// handler does I/O; everything that decides whether a pick is legal, and what
// line it gets, lives here.

import { PICKEM_MARKETS, type PickemMarket } from './types';

export interface OddsRow {
  market_type: string;
  selection: string;
  line: number | null;
  american_odds: number | null;
}

export interface ResolvedLine {
  contestLine: number | null;
  contestOdds: number | null;
}

export interface SubmittedPick {
  gameId: string;
  marketType: PickemMarket;
  selection: string;
}

export const VALID_SELECTIONS: Record<PickemMarket, readonly string[]> = {
  moneyline: ['home', 'away'],
  spread: ['home', 'away'],
  total: ['over', 'under'],
};

export function isPickemMarket(value: unknown): value is PickemMarket {
  return typeof value === 'string' && (PICKEM_MARKETS as readonly string[]).includes(value);
}

export function isValidSelection(market: PickemMarket, selection: unknown): boolean {
  return typeof selection === 'string' && VALID_SELECTIONS[market].includes(selection);
}

/**
 * Find the line and price for one selection among a game's active odds.
 *
 * This is the whole reason the client is not trusted with a line: a submitted
 * pick takes its number from here, so a crafted request cannot award itself a
 * +40 spread. Returns null when the market was never posted, which the caller
 * turns into a rejection rather than a pick with no line.
 */
export function resolveContestLine(
  market: PickemMarket,
  selection: string,
  odds: readonly OddsRow[],
): ResolvedLine | null {
  const match = odds.find((o) => o.market_type === market && o.selection === selection);
  if (!match) return null;

  // Moneyline needs a price but no line; spread and total need both.
  if (market === 'moneyline') {
    if (match.american_odds === null) return null;
    return { contestLine: null, contestOdds: match.american_odds };
  }

  if (match.line === null) return null;
  return { contestLine: Number(match.line), contestOdds: match.american_odds };
}

export interface ValidationContext {
  enabledMarkets: readonly string[];
  /** Game ids belonging to this challenge's week, mapped to kickoff time. */
  kickoffByGameId: ReadonlyMap<string, string>;
  lockTime: string | null;
  now?: Date;
}

export type Rejection =
  | { gameId: string; reason: 'unknown_game' }
  | { gameId: string; reason: 'invalid_market' }
  | { gameId: string; reason: 'market_not_enabled' }
  | { gameId: string; reason: 'invalid_selection' }
  | { gameId: string; reason: 'duplicate_game' }
  | { gameId: string; reason: 'game_started' }
  | { gameId: string; reason: 'card_locked' }
  | { gameId: string; reason: 'no_line' };

export interface ValidationResult {
  accepted: SubmittedPick[];
  rejected: Rejection[];
}

/**
 * Validate a submitted card.
 *
 * Rejects rather than filters: a pick on a disabled market or a started game is
 * an error the player is told about, not something silently dropped. The old
 * build filtered, so a mis-sent pick vanished with no explanation.
 */
export function validateSubmission(
  picks: readonly SubmittedPick[],
  context: ValidationContext,
): ValidationResult {
  const now = context.now ?? new Date();
  const accepted: SubmittedPick[] = [];
  const rejected: Rejection[] = [];
  const seen = new Set<string>();

  const cardLocked =
    context.lockTime !== null && now.getTime() >= new Date(context.lockTime).getTime();

  for (const pick of picks) {
    if (cardLocked) {
      rejected.push({ gameId: pick.gameId, reason: 'card_locked' });
      continue;
    }

    const kickoff = context.kickoffByGameId.get(pick.gameId);
    if (!kickoff) {
      rejected.push({ gameId: pick.gameId, reason: 'unknown_game' });
      continue;
    }

    if (!isPickemMarket(pick.marketType)) {
      rejected.push({ gameId: pick.gameId, reason: 'invalid_market' });
      continue;
    }

    if (!context.enabledMarkets.includes(pick.marketType)) {
      rejected.push({ gameId: pick.gameId, reason: 'market_not_enabled' });
      continue;
    }

    if (!isValidSelection(pick.marketType, pick.selection)) {
      rejected.push({ gameId: pick.gameId, reason: 'invalid_selection' });
      continue;
    }

    // One market per game, mutually exclusive. The database guarantees this
    // too, but catching it here gives a usable error instead of a constraint
    // violation.
    if (seen.has(pick.gameId)) {
      rejected.push({ gameId: pick.gameId, reason: 'duplicate_game' });
      continue;
    }

    if (now.getTime() >= new Date(kickoff).getTime()) {
      rejected.push({ gameId: pick.gameId, reason: 'game_started' });
      continue;
    }

    seen.add(pick.gameId);
    accepted.push(pick);
  }

  return { accepted, rejected };
}

export function parseSubmittedPicks(raw: unknown): SubmittedPick[] | null {
  if (!Array.isArray(raw)) return null;

  const picks: SubmittedPick[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { gameId, marketType, selection } = entry as Record<string, unknown>;
    if (typeof gameId !== 'string' || !gameId) return null;
    if (!isPickemMarket(marketType)) return null;
    if (typeof selection !== 'string' || !selection) return null;
    picks.push({ gameId, marketType, selection });
  }
  return picks;
}
