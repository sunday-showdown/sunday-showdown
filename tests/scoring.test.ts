import { describe, it, expect } from 'vitest';
import { gradePick, summarizeWeek, rankWeek } from '../lib/scoring';
import {
  pointsForOdds,
  impliedProbability,
  americanToDecimal,
  probabilityToAmerican,
  STAKE,
  MAX_POINTS,
  PUSH_POINTS,
  DEFAULT_WIN_POINTS,
} from '../lib/odds';

const final = (homeScore: number, awayScore: number) => ({
  status: 'final',
  homeScore,
  awayScore,
});

describe('payout rule', () => {
  it('pays the decimal odds on a $10 stake', () => {
    expect(pointsForOdds(100)).toBe(20); // even money doubles the stake
    expect(pointsForOdds(-110)).toBe(19);
    expect(pointsForOdds(400)).toBe(50);
    expect(pointsForOdds(-600)).toBe(12);
  });

  it('removes the arbitrage between a short spread and its moneyline', () => {
    // The bug in a fixed-points scheme: at -0.5 the spread and the moneyline
    // are the SAME bet, so paying the spread more was free points.
    const shortSpread = pointsForOdds(-110);
    const equivalentMoneyline = pointsForOdds(-115);
    expect(Math.abs(shortSpread - equivalentMoneyline)).toBeLessThanOrEqual(1);
  });

  it('gives every pick roughly the same expected value', () => {
    // No market and no side can be strictly better, or everyone picks it.
    for (const odds of [-600, -300, -110, 100, 150, 400]) {
      const expected = impliedProbability(odds)! * pointsForOdds(odds);
      expect(expected).toBeGreaterThan(9.5);
      expect(expected).toBeLessThan(10.5);
    }
  });

  it('pays a long shot more than chalk', () => {
    expect(pointsForOdds(400)).toBeGreaterThan(pointsForOdds(-600));
  });

  it('caps the longest shots so one pick cannot decide a season', () => {
    expect(pointsForOdds(100000)).toBe(MAX_POINTS);
  });

  it('falls back to the standard price when none was stored', () => {
    expect(pointsForOdds(null)).toBe(DEFAULT_WIN_POINTS);
    expect(pointsForOdds(undefined)).toBe(DEFAULT_WIN_POINTS);
    expect(DEFAULT_WIN_POINTS).toBe(19);
  });

  it('rejects impossible prices rather than scoring them', () => {
    expect(pointsForOdds(50)).toBe(DEFAULT_WIN_POINTS);
    expect(pointsForOdds(0)).toBe(DEFAULT_WIN_POINTS);
    expect(pointsForOdds(NaN)).toBe(DEFAULT_WIN_POINTS);
  });

  it('converts American to decimal correctly', () => {
    expect(americanToDecimal(400)).toBeCloseTo(5, 4);
    expect(americanToDecimal(-600)).toBeCloseTo(1.1667, 3);
    expect(americanToDecimal(100)).toBeCloseTo(2, 4);
  });

  it('round-trips probability and odds', () => {
    for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const american = probabilityToAmerican(p)!;
      expect(impliedProbability(american)!).toBeCloseTo(p, 2);
    }
  });
});

describe('gradePick — moneyline', () => {
  const ml = (selection: string, contestOdds: number) => ({
    marketType: 'moneyline' as const,
    selection,
    contestLine: null,
    contestOdds,
  });

  it('pays the posted price on a winner', () => {
    expect(gradePick(ml('home', -150), final(24, 17))).toEqual({ result: 'win', points: 17 });
    expect(gradePick(ml('away', 400), final(17, 24))).toEqual({ result: 'win', points: 50 });
  });

  it('pays nothing for the losing side', () => {
    expect(gradePick(ml('home', -150), final(17, 24))).toEqual({ result: 'loss', points: 0 });
  });

  it('returns the stake on a tie', () => {
    expect(gradePick(ml('home', -150), final(20, 20))).toEqual({ result: 'push', points: PUSH_POINTS });
  });

  it('pays a heavy favourite far less than an underdog', () => {
    const chalk = gradePick(ml('home', -600), final(31, 10)).points;
    const dog = gradePick(ml('away', 400), final(10, 31)).points;
    expect(dog).toBeGreaterThan(chalk * 3);
  });
});

describe('gradePick — spread', () => {
  const spread = (selection: string, contestLine: number, contestOdds = -110) => ({
    marketType: 'spread' as const,
    selection,
    contestLine,
    contestOdds,
  });

  it('pays when a favourite covers', () => {
    expect(gradePick(spread('home', -9.5), final(30, 20))).toEqual({ result: 'win', points: 19 });
  });

  it('fails a favourite that wins without covering', () => {
    expect(gradePick(spread('home', -9.5), final(27, 20))).toEqual({ result: 'loss', points: 0 });
  });

  it('pays an underdog that loses by less than the spread', () => {
    expect(gradePick(spread('away', 9.5), final(27, 20))).toEqual({ result: 'win', points: 19 });
  });

  it('returns the stake when the margin lands exactly on a whole-number line', () => {
    expect(gradePick(spread('home', -7), final(27, 20))).toEqual({ result: 'push', points: PUSH_POINTS });
  });

  it('never pushes on a half-point line', () => {
    for (const home of [20, 21, 27, 28, 34]) {
      const result = gradePick(spread('home', -7.5), final(home, 20)).result;
      expect(result === 'win' || result === 'loss').toBe(true);
    }
  });

  it('handles a pick-em spread of zero', () => {
    expect(gradePick(spread('home', 0), final(24, 17)).result).toBe('win');
    expect(gradePick(spread('home', 0), final(20, 20)).result).toBe('push');
  });

  it('grades and pays against the stored line and price, not the current one', () => {
    // Taken at -3 and +120 when the book was generous; it later closed at -9.5
    // and -140. The player gets the line they took AND the price they took.
    expect(gradePick(spread('home', -3, 120), final(27, 20))).toEqual({
      result: 'win',
      points: 22,
    });
  });

  it('stays pending when no line was stored', () => {
    expect(
      gradePick({ marketType: 'spread', selection: 'home', contestLine: null, contestOdds: -110 }, final(30, 20)),
    ).toEqual({ result: 'pending', points: 0 });
  });
});

describe('gradePick — total', () => {
  const total = (selection: string, contestLine: number, contestOdds = -110) => ({
    marketType: 'total' as const,
    selection,
    contestLine,
    contestOdds,
  });

  it('pays the over when the combined score clears the line', () => {
    expect(gradePick(total('over', 47.5), final(30, 24))).toEqual({ result: 'win', points: 19 });
  });

  it('pays the under when it stays below', () => {
    expect(gradePick(total('under', 47.5), final(20, 17))).toEqual({ result: 'win', points: 19 });
  });

  it('returns the stake when the score lands on a whole-number total', () => {
    expect(gradePick(total('over', 44), final(24, 20)).points).toBe(PUSH_POINTS);
    expect(gradePick(total('under', 44), final(24, 20)).points).toBe(PUSH_POINTS);
  });

  it('counts a shutout correctly', () => {
    expect(gradePick(total('under', 10.5), final(7, 0)).result).toBe('win');
  });
});

describe('gradePick — ungradeable states', () => {
  const pick = {
    marketType: 'moneyline' as const,
    selection: 'home',
    contestLine: null,
    contestOdds: -110,
  };

  it('stays pending until the game is final', () => {
    expect(gradePick(pick, { status: 'scheduled', homeScore: null, awayScore: null }).result).toBe('pending');
    expect(gradePick(pick, { status: 'in_progress', homeScore: 14, awayScore: 7 }).result).toBe('pending');
  });

  it('never grades a leading team as a winner mid-game', () => {
    expect(gradePick(pick, { status: 'in_progress', homeScore: 14, awayScore: 7 })).toEqual({
      result: 'pending',
      points: 0,
    });
  });

  it('stays pending on a final game with missing scores', () => {
    expect(gradePick(pick, { status: 'final', homeScore: null, awayScore: 24 }).result).toBe('pending');
  });

  it('stays pending for a postponed game', () => {
    expect(gradePick(pick, { status: 'postponed', homeScore: null, awayScore: null }).result).toBe('pending');
  });

  it('stays pending for an unknown selection', () => {
    expect(gradePick({ ...pick, selection: 'tie' }, final(24, 17)).result).toBe('pending');
  });

  it('treats a 0-0 final as a real tie, not missing data', () => {
    expect(gradePick(pick, final(0, 0)).result).toBe('push');
  });

  it('stays pending for undefined scores instead of reporting a push', () => {
    // Regression: grading passed raw snake_case database rows in, so the
    // camelCase score fields were undefined. undefined slipped past a `=== null`
    // guard, every comparison against NaN was false, and settle() returned a
    // push — so every pick in the league graded as a push, which looks like a
    // real result rather than an error.
    expect(
      gradePick(pick, {
        status: 'final',
        homeScore: undefined as unknown as number | null,
        awayScore: undefined as unknown as number | null,
      }),
    ).toEqual({ result: 'pending', points: 0 });
  });

  it('stays pending for NaN scores and NaN lines', () => {
    expect(gradePick(pick, { status: 'final', homeScore: NaN, awayScore: 20 }).result).toBe('pending');
    expect(
      gradePick({ marketType: 'spread', selection: 'home', contestLine: NaN, contestOdds: -110 }, final(30, 20)),
    ).toEqual({ result: 'pending', points: 0 });
  });

  it('still grades a win when the price is missing, using the standard price', () => {
    // A pick with no stored odds is a data problem, not a reason to void a
    // correct call.
    expect(
      gradePick({ marketType: 'moneyline', selection: 'home', contestLine: null, contestOdds: null }, final(24, 17)),
    ).toEqual({ result: 'win', points: DEFAULT_WIN_POINTS });
  });
});



describe('summarizeWeek', () => {
  it('totals points and counts each market separately', () => {
    const totals = summarizeWeek([
      { marketType: 'moneyline', result: 'win', points: 17 },
      { marketType: 'spread', result: 'win', points: 19 },
      { marketType: 'total', result: 'win', points: 19 },
      { marketType: 'spread', result: 'loss', points: 0 },
      { marketType: 'total', result: 'push', points: 10 },
      { marketType: 'moneyline', result: 'pending', points: 0 },
    ]);

    expect(totals).toEqual({
      pickemPoints: 65,
      correctMl: 1,
      correctSpread: 1,
      correctTotals: 1,
      wins: 3,
      losses: 1,
      pushes: 1,
      pending: 1,
    });
  });

  it('returns zeroes for an empty week', () => {
    expect(summarizeWeek([])).toMatchObject({ pickemPoints: 0, wins: 0, pending: 0 });
  });

  it('does not count a push as a win', () => {
    const totals = summarizeWeek([{ marketType: 'spread', result: 'push', points: 10 }]);
    expect(totals.wins).toBe(0);
    expect(totals.correctSpread).toBe(0);
  });
});

describe('rankWeek', () => {
  it('ranks by points descending', () => {
    const standings = rankWeek([
      { userId: 'b', totalPoints: 100, wins: 3 },
      { userId: 'a', totalPoints: 160, wins: 4 },
      { userId: 'c', totalPoints: 50, wins: 2 },
    ]);
    expect(standings.map((s) => s.userId)).toEqual(['a', 'b', 'c']);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it('shares a rank on a tie and skips the consumed place', () => {
    const standings = rankWeek([
      { userId: 'a', totalPoints: 160, wins: 4 },
      { userId: 'b', totalPoints: 100, wins: 3 },
      { userId: 'c', totalPoints: 100, wins: 3 },
      { userId: 'd', totalPoints: 50, wins: 2 },
    ]);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 2, 4]);
  });

  it('makes every player tied at the top a winner', () => {
    const standings = rankWeek([
      { userId: 'a', totalPoints: 160, wins: 4 },
      { userId: 'b', totalPoints: 160, wins: 4 },
      { userId: 'c', totalPoints: 90, wins: 3 },
    ]);
    expect(standings.filter((s) => s.isWinner).map((s) => s.userId)).toEqual(['a', 'b']);
  });

  it('breaks a points tie on wins before falling back to id', () => {
    const standings = rankWeek([
      { userId: 'a', totalPoints: 100, wins: 2 },
      { userId: 'b', totalPoints: 100, wins: 6 },
    ]);
    expect(standings[0]).toMatchObject({ userId: 'b', rank: 1, isWinner: true });
  });

  it('produces identical ranks on a replay', () => {
    const entries = [
      { userId: 'zeta', totalPoints: 100, wins: 3 },
      { userId: 'alpha', totalPoints: 100, wins: 3 },
      { userId: 'mid', totalPoints: 100, wins: 3 },
    ];
    expect(rankWeek([...entries].reverse())).toEqual(rankWeek(entries));
    expect(rankWeek(entries).map((s) => s.userId)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('does not mutate its input', () => {
    const entries = [
      { userId: 'a', totalPoints: 50, wins: 1 },
      { userId: 'b', totalPoints: 100, wins: 2 },
    ];
    rankWeek(entries);
    expect(entries[0]!.userId).toBe('a');
  });

  it('handles an empty league', () => {
    expect(rankWeek([])).toEqual([]);
  });
});

describe('STAKE', () => {
  it('is the baseline every payout is built from', () => {
    expect(STAKE).toBe(10);
    expect(PUSH_POINTS).toBe(STAKE);
  });
});
