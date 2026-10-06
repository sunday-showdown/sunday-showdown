// Your betting record.
//
// Worth repeating the constraint from lib/sportsbooks.ts, because it shapes
// this file too: no US sportsbook publishes an API that would let an app read
// somebody's actual wagers. There is nothing to sync. So a bet gets here
// because the person logged it, and the job of this module is to make that
// worth doing — to turn a list of slips into the numbers people actually care
// about, which are units and ROI rather than a count of wins.
//
// Units, not dollars, is the measure for a reason. "Up $400" says nothing
// without knowing whether that came from $20 bets or $2,000 ones. A unit is
// one standard bet, so "+8.4 units" is comparable across people and across
// seasons, and it is what every serious tracker reports.

import { toWin } from './bets';

export interface TrackedBet {
  id: string;
  book: string;
  legs: number;
  americanOdds: number;
  /** In currency. Null when somebody logged a bet without one. */
  stake: number | null;
  result: string;
  createdAt: string;
}

export interface BetRecord {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  /** Settled bets only — a pending slip has not told you anything yet. */
  settled: number;
  /** Wins as a share of decided bets. Pushes are excluded, as a book would. */
  winRate: number | null;
  unitsStaked: number;
  /** Positive is profit. */
  unitsWon: number;
  /** Profit over turnover. Null until something has actually been risked. */
  roi: number | null;
  /** Consecutive settled results of the same kind, most recent first. */
  streak: { kind: 'win' | 'loss' | null; length: number };
}

export interface BookRecord extends BetRecord {
  book: string;
}

const EMPTY: BetRecord = {
  wins: 0,
  losses: 0,
  pushes: 0,
  pending: 0,
  settled: 0,
  winRate: null,
  unitsStaked: 0,
  unitsWon: 0,
  roi: null,
  streak: { kind: null, length: 0 },
};

/** Two decimal places, and never -0. */
function round(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/**
 * What one settled bet returned, in units.
 *
 * A loss costs the stake. A push returns it. A win pays the odds. A bet logged
 * without a stake cannot contribute to a units figure at all — counting it as
 * one unit would be inventing data — so it counts towards the record and not
 * towards the money.
 */
function unitsFor(bet: TrackedBet, unitSize: number): { staked: number; won: number } | null {
  if (bet.stake === null || bet.stake <= 0 || unitSize <= 0) return null;

  const staked = bet.stake / unitSize;

  if (bet.result === 'push') return { staked, won: 0 };
  if (bet.result === 'loss') return { staked, won: -staked };
  if (bet.result === 'win') {
    const profit = toWin(bet.stake, bet.americanOdds);
    if (profit === null) return { staked, won: 0 };
    return { staked, won: profit / unitSize };
  }
  return null;
}

/**
 * Fold a list of bets into a record.
 *
 * `unitSize` is what one unit is worth to this person, in the same currency
 * their stakes are in.
 */
export function summarise(bets: readonly TrackedBet[], unitSize: number): BetRecord {
  if (bets.length === 0) return { ...EMPTY };

  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let pending = 0;
  let unitsStaked = 0;
  let unitsWon = 0;

  for (const bet of bets) {
    if (bet.result === 'win') wins += 1;
    else if (bet.result === 'loss') losses += 1;
    else if (bet.result === 'push') pushes += 1;
    else {
      pending += 1;
      continue;
    }

    const units = unitsFor(bet, unitSize);
    if (units) {
      unitsStaked += units.staked;
      unitsWon += units.won;
    }
  }

  const decided = wins + losses;

  return {
    wins,
    losses,
    pushes,
    pending,
    settled: wins + losses + pushes,
    winRate: decided === 0 ? null : wins / decided,
    unitsStaked: round(unitsStaked),
    unitsWon: round(unitsWon),
    roi: unitsStaked === 0 ? null : round(unitsWon / unitsStaked * 100) / 100,
    streak: streakOf(bets),
  };
}

/**
 * The current run of wins or losses.
 *
 * Pushes are skipped rather than breaking a streak — a push is the bet not
 * happening, and no tracker counts it as either. Pending bets are skipped for
 * the same reason: they have not happened yet.
 */
export function streakOf(bets: readonly TrackedBet[]): { kind: 'win' | 'loss' | null; length: number } {
  const settled = [...bets]
    .filter((bet) => bet.result === 'win' || bet.result === 'loss')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const first = settled[0];
  if (!first) return { kind: null, length: 0 };

  const kind = first.result as 'win' | 'loss';
  let length = 0;
  for (const bet of settled) {
    if (bet.result !== kind) break;
    length += 1;
  }
  return { kind, length };
}

/** The same record, per sportsbook, busiest first. */
export function byBook(bets: readonly TrackedBet[], unitSize: number): BookRecord[] {
  const grouped = new Map<string, TrackedBet[]>();
  for (const bet of bets) {
    grouped.set(bet.book, [...(grouped.get(bet.book) ?? []), bet]);
  }

  return [...grouped.entries()]
    .map(([book, list]) => ({ book, ...summarise(list, unitSize) }))
    .sort((a, b) => b.settled + b.pending - (a.settled + a.pending));
}

/** Singles against parlays, which is usually where the damage is. */
export function byKind(
  bets: readonly TrackedBet[],
  unitSize: number,
): { singles: BetRecord; parlays: BetRecord } {
  return {
    singles: summarise(bets.filter((bet) => bet.legs <= 1), unitSize),
    parlays: summarise(bets.filter((bet) => bet.legs > 1), unitSize),
  };
}

/** "+8.4u" / "-2u" — the way a betting record is always written. */
export function formatUnits(units: number): string {
  const rounded = round(units);
  const sign = rounded > 0 ? '+' : '';
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, '');
  return `${sign}${body}u`;
}

/** A percentage with one decimal, or an em dash when there is nothing to show. */
export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${(rate * 100).toFixed(1)}%`;
}
