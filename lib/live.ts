// Live status of a pick while its game is in progress.
//
// Nothing here settles anything — grading is server-side and only runs on a
// final game. This exists so a player can watch their card on Sunday and see
// where they stand, which is the whole reason to open the app during games.

import { pointsForOdds } from './odds';
import type { PickemMarket } from './types';

export type LiveStandingState = 'winning' | 'losing' | 'tied' | 'settled' | 'waiting';

export interface LivePick {
  marketType: PickemMarket;
  selection: string;
  contestLine: number | null;
  contestOdds: number | null;
  result: string;
  points: number;
}

export interface LiveGame {
  status: string;
  homeScore: number | null;
  awayScore: number | null;
}

/**
 * Where a pick stands right now.
 *
 * Deliberately labelled 'winning' rather than 'won': a pick is not settled
 * until the game is final and the server says so. Calling a halftime lead a win
 * is exactly the mistake the grading engine refuses to make.
 */
export function liveState(pick: LivePick, game: LiveGame): LiveStandingState {
  if (pick.result !== 'pending') return 'settled';
  if (game.status === 'scheduled' || game.status === 'postponed') return 'waiting';

  const home = numberOrNull(game.homeScore);
  const away = numberOrNull(game.awayScore);
  if (home === null || away === null) return 'waiting';

  const margin = marginFor(pick, home, away);
  if (margin === null) return 'waiting';
  if (margin > 0) return 'winning';
  if (margin < 0) return 'losing';
  return 'tied';
}

/** What this pick would be worth if the game ended now. */
export function liveValue(pick: LivePick, game: LiveGame): number {
  if (pick.result !== 'pending') return pick.points;
  return liveState(pick, game) === 'winning' ? pointsForOdds(pick.contestOdds) : 0;
}

function marginFor(pick: LivePick, home: number, away: number): number | null {
  switch (pick.marketType) {
    case 'moneyline':
      if (pick.selection !== 'home' && pick.selection !== 'away') return null;
      return pick.selection === 'home' ? home - away : away - home;

    case 'spread': {
      if (pick.selection !== 'home' && pick.selection !== 'away') return null;
      const line = numberOrNull(pick.contestLine);
      if (line === null) return null;
      const picked = pick.selection === 'home' ? home : away;
      const other = pick.selection === 'home' ? away : home;
      return picked + line - other;
    }

    case 'total': {
      if (pick.selection !== 'over' && pick.selection !== 'under') return null;
      const line = numberOrNull(pick.contestLine);
      if (line === null) return null;
      const combined = home + away;
      return pick.selection === 'over' ? combined - line : line - combined;
    }

    default:
      return null;
  }
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export interface LiveSummary {
  banked: number;
  inPlay: number;
  atRisk: number;
  settled: number;
  live: number;
  waiting: number;
}

/**
 * A player's card at a glance.
 *
 * `banked` is already decided; `inPlay` is what is currently on track but not
 * yet final. They are kept apart on purpose — showing one total would imply a
 * score that has not been earned.
 */
export function summarizeLive(
  entries: readonly { pick: LivePick; game: LiveGame }[],
): LiveSummary {
  const summary: LiveSummary = {
    banked: 0,
    inPlay: 0,
    atRisk: 0,
    settled: 0,
    live: 0,
    waiting: 0,
  };

  for (const { pick, game } of entries) {
    const state = liveState(pick, game);

    if (state === 'settled') {
      summary.banked += pick.points;
      summary.settled += 1;
      continue;
    }

    if (state === 'waiting') {
      summary.waiting += 1;
      continue;
    }

    summary.live += 1;
    if (state === 'winning') summary.inPlay += pointsForOdds(pick.contestOdds);
    else summary.atRisk += pointsForOdds(pick.contestOdds);
  }

  return summary;
}
