// Pick'em grading.
//
// Pure functions: no database, no clock, no network. Everything a result
// depends on is an argument, so grading is reproducible and a disputed week can
// be replayed exactly.
//
// Every market is graded against the line stored on the pick, never a live
// line. A book moving a spread after submission must not change a settled pick.

import { MARKET_POINTS, type PickResult, type PickemMarket } from './types';

export interface GradeableGame {
  status: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface GradeablePick {
  marketType: PickemMarket;
  /** 'home' | 'away' for moneyline and spread; 'over' | 'under' for total. */
  selection: string;
  /** The line as offered to this player. Required for spread and total. */
  contestLine: number | null;
}

export interface Grade {
  result: PickResult;
  points: number;
}

const PENDING: Grade = { result: 'pending', points: 0 };

function settle(market: PickemMarket, margin: number): Grade {
  if (margin > 0) return { result: 'win', points: MARKET_POINTS[market] };
  if (margin < 0) return { result: 'loss', points: 0 };
  return { result: 'push', points: 0 };
}

/**
 * Grade one pick.
 *
 * Returns `pending` whenever the game cannot yet be settled — not final, or
 * final without scores. Returns `pending` for a malformed pick too (a spread
 * with no stored line, an unknown selection) rather than guessing: a wrong
 * result is far worse than an ungraded one, and an ungraded pick is visible.
 */
/**
 * A usable score, or null.
 *
 * Checks finiteness, not just non-null. A `=== null` test alone lets undefined
 * and NaN through, and every comparison against NaN is false — so `settle`
 * returns a push, which is the worst possible failure because it looks like a
 * real result rather than an error.
 */
function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function gradePick(pick: GradeablePick, game: GradeableGame): Grade {
  if (game.status !== 'final') return PENDING;

  const homeScore = finiteOrNull(game.homeScore);
  const awayScore = finiteOrNull(game.awayScore);
  if (homeScore === null || awayScore === null) return PENDING;

  switch (pick.marketType) {
    case 'moneyline': {
      if (pick.selection !== 'home' && pick.selection !== 'away') return PENDING;
      const margin =
        pick.selection === 'home' ? homeScore - awayScore : awayScore - homeScore;
      return settle('moneyline', margin);
    }

    case 'spread': {
      if (pick.selection !== 'home' && pick.selection !== 'away') return PENDING;
      // Finite, not merely non-null: a NaN line also lands on a push, for the
      // same reason an unusable score does.
      const line = finiteOrNull(pick.contestLine);
      if (line === null) return PENDING;
      // The line is from the picked side's perspective: a favourite carries a
      // negative line and must cover it.
      const picked = pick.selection === 'home' ? homeScore : awayScore;
      const other = pick.selection === 'home' ? awayScore : homeScore;
      return settle('spread', picked + line - other);
    }

    case 'total': {
      if (pick.selection !== 'over' && pick.selection !== 'under') return PENDING;
      const line = finiteOrNull(pick.contestLine);
      if (line === null) return PENDING;
      const combined = homeScore + awayScore;
      const margin = pick.selection === 'over' ? combined - line : line - combined;
      return settle('total', margin);
    }

    default:
      return PENDING;
  }
}

export interface WeeklyTotals {
  pickemPoints: number;
  correctMl: number;
  correctSpread: number;
  correctTotals: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
}

/** Aggregate a player's graded picks for one week. */
export function summarizeWeek(
  picks: readonly { marketType: PickemMarket; result: PickResult; points: number }[],
): WeeklyTotals {
  const totals: WeeklyTotals = {
    pickemPoints: 0,
    correctMl: 0,
    correctSpread: 0,
    correctTotals: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    pending: 0,
  };

  for (const pick of picks) {
    totals.pickemPoints += pick.points;

    switch (pick.result) {
      case 'win':
        totals.wins += 1;
        if (pick.marketType === 'moneyline') totals.correctMl += 1;
        else if (pick.marketType === 'spread') totals.correctSpread += 1;
        else if (pick.marketType === 'total') totals.correctTotals += 1;
        break;
      case 'loss':
        totals.losses += 1;
        break;
      case 'push':
        totals.pushes += 1;
        break;
      default:
        totals.pending += 1;
    }
  }

  return totals;
}

export interface Standing {
  userId: string;
  totalPoints: number;
  wins: number;
  rank: number;
  isWinner: boolean;
}

/**
 * Rank a week's entrants.
 *
 * Ties share a rank and consume the places behind them (1, 2, 2, 4), and every
 * player tied at the top is a winner — the weekly prize is split rather than
 * awarded to whoever the sort happened to put first. Ordering is made total by
 * falling back to wins and then user id, so a replay produces identical ranks.
 */
export function rankWeek(
  entries: readonly { userId: string; totalPoints: number; wins: number }[],
): Standing[] {
  const sorted = [...entries].sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      b.wins - a.wins ||
      a.userId.localeCompare(b.userId),
  );

  const standings: Standing[] = [];
  let rank = 0;
  let previousKey: string | null = null;

  sorted.forEach((entry, index) => {
    const key = `${entry.totalPoints}:${entry.wins}`;
    if (key !== previousKey) {
      rank = index + 1;
      previousKey = key;
    }
    standings.push({
      userId: entry.userId,
      totalPoints: entry.totalPoints,
      wins: entry.wins,
      rank,
      isWinner: false,
    });
  });

  const best = standings[0]?.rank;
  for (const standing of standings) {
    standing.isWinner = standing.rank === best;
  }

  return standings;
}
