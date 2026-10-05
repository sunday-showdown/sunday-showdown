import { describe, it, expect } from 'vitest';
import { gradePick, summarizeWeek, rankWeek } from '../lib/scoring';
import { MARKET_POINTS, TD_TIERS, tdTierFor, tdPointsFor } from '../lib/types';

const final = (homeScore: number, awayScore: number) => ({
  status: 'final',
  homeScore,
  awayScore,
});

describe('point values', () => {
  it('pays moneyline 1 and the line markets 3', () => {
    // These are the competition's defining numbers; a silent change here would
    // rescore every week in the league's history.
    expect(MARKET_POINTS).toEqual({ moneyline: 1, spread: 3, total: 3 });
  });
});

describe('gradePick — moneyline', () => {
  const ml = (selection: string) => ({ marketType: 'moneyline' as const, selection, contestLine: null });

  it('pays 1 point for the winning side', () => {
    expect(gradePick(ml('home'), final(24, 17))).toEqual({ result: 'win', points: 1 });
    expect(gradePick(ml('away'), final(17, 24))).toEqual({ result: 'win', points: 1 });
  });

  it('awards nothing for the losing side', () => {
    expect(gradePick(ml('home'), final(17, 24))).toEqual({ result: 'loss', points: 0 });
  });

  it('pushes a tie', () => {
    expect(gradePick(ml('home'), final(20, 20))).toEqual({ result: 'push', points: 0 });
    expect(gradePick(ml('away'), final(20, 20))).toEqual({ result: 'push', points: 0 });
  });

  it('needs no line', () => {
    expect(gradePick(ml('home'), final(24, 17)).result).toBe('win');
  });
});

describe('gradePick — spread', () => {
  const spread = (selection: string, contestLine: number) => ({
    marketType: 'spread' as const,
    selection,
    contestLine,
  });

  it('pays 3 when a favourite covers', () => {
    // Home -9.5, home wins by 10.
    expect(gradePick(spread('home', -9.5), final(30, 20))).toEqual({ result: 'win', points: 3 });
  });

  it('fails a favourite that wins without covering', () => {
    // Home -9.5, home wins by only 7.
    expect(gradePick(spread('home', -9.5), final(27, 20))).toEqual({ result: 'loss', points: 0 });
  });

  it('pays an underdog that loses by less than the spread', () => {
    // Away +9.5, away loses by 7.
    expect(gradePick(spread('away', 9.5), final(27, 20))).toEqual({ result: 'win', points: 3 });
  });

  it('pays an underdog that wins outright', () => {
    expect(gradePick(spread('away', 3), final(17, 24))).toEqual({ result: 'win', points: 3 });
  });

  it('pushes when the margin lands exactly on a whole-number line', () => {
    // Home -7, home wins by exactly 7.
    expect(gradePick(spread('home', -7), final(27, 20))).toEqual({ result: 'push', points: 0 });
    expect(gradePick(spread('away', 7), final(27, 20))).toEqual({ result: 'push', points: 0 });
  });

  it('never pushes on a half-point line', () => {
    for (const home of [20, 21, 27, 28, 34]) {
      const result = gradePick(spread('home', -7.5), final(home, 20)).result;
      expect(result === 'win' || result === 'loss').toBe(true);
    }
  });

  it('handles a pick-em spread of zero', () => {
    expect(gradePick(spread('home', 0), final(24, 17))).toEqual({ result: 'win', points: 3 });
    expect(gradePick(spread('home', 0), final(20, 20))).toEqual({ result: 'push', points: 0 });
  });

  it('grades against the stored line, not the closing one', () => {
    // Taken at -3, the book closed at -9.5, home won by 7. The player who took
    // -3 covered and must be paid, whatever the line moved to afterwards.
    expect(gradePick(spread('home', -3), final(27, 20))).toEqual({ result: 'win', points: 3 });
  });

  it('stays pending when no line was stored', () => {
    // Rather than assume zero, which would silently grade a spread as a
    // moneyline.
    expect(gradePick({ marketType: 'spread', selection: 'home', contestLine: null }, final(30, 20)))
      .toEqual({ result: 'pending', points: 0 });
  });
});

describe('gradePick — total', () => {
  const total = (selection: string, contestLine: number) => ({
    marketType: 'total' as const,
    selection,
    contestLine,
  });

  it('pays the over when the combined score clears the line', () => {
    expect(gradePick(total('over', 47.5), final(30, 24))).toEqual({ result: 'win', points: 3 });
  });

  it('pays the under when it stays below', () => {
    expect(gradePick(total('under', 47.5), final(20, 17))).toEqual({ result: 'win', points: 3 });
  });

  it('fails the over when the game stays low', () => {
    expect(gradePick(total('over', 47.5), final(20, 17))).toEqual({ result: 'loss', points: 0 });
  });

  it('pushes when the combined score lands on a whole-number total', () => {
    expect(gradePick(total('over', 44), final(24, 20))).toEqual({ result: 'push', points: 0 });
    expect(gradePick(total('under', 44), final(24, 20))).toEqual({ result: 'push', points: 0 });
  });

  it('counts a shutout correctly', () => {
    expect(gradePick(total('under', 10.5), final(7, 0))).toEqual({ result: 'win', points: 3 });
  });
});

describe('gradePick — ungradeable states', () => {
  const pick = { marketType: 'moneyline' as const, selection: 'home', contestLine: null };

  it('stays pending until the game is final', () => {
    expect(gradePick(pick, { status: 'scheduled', homeScore: null, awayScore: null }).result).toBe('pending');
    expect(gradePick(pick, { status: 'in_progress', homeScore: 14, awayScore: 7 }).result).toBe('pending');
  });

  it('never grades a leading team as a winner mid-game', () => {
    // The whole point of the status gate: a team up 14-7 at halftime has not won.
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
    expect(gradePick({ marketType: 'moneyline', selection: 'tie', contestLine: null }, final(24, 17)).result)
      .toBe('pending');
    expect(gradePick({ marketType: 'total', selection: 'home', contestLine: 44 }, final(24, 17)).result)
      .toBe('pending');
  });

  it('treats a 0-0 final as a real tie, not missing data', () => {
    expect(gradePick(pick, final(0, 0))).toEqual({ result: 'push', points: 0 });
  });

  it('stays pending for undefined scores instead of reporting a push', () => {
    // Regression: grading passed raw snake_case database rows in, so the
    // camelCase score fields were undefined. undefined slipped past a `=== null`
    // guard, every comparison against NaN was false, and settle() returned a
    // push — so every pick in the league graded as a push, which looks like a
    // real result rather than an error.
    const undefinedScores = {
      status: 'final',
      homeScore: undefined as unknown as number | null,
      awayScore: undefined as unknown as number | null,
    };
    expect(gradePick(pick, undefinedScores)).toEqual({ result: 'pending', points: 0 });
  });

  it('stays pending for NaN scores', () => {
    const nanScores = { status: 'final', homeScore: NaN, awayScore: 20 };
    expect(gradePick(pick, nanScores)).toEqual({ result: 'pending', points: 0 });
  });

  it('stays pending for a NaN line rather than pushing', () => {
    const badSpread = { marketType: 'spread' as const, selection: 'home', contestLine: NaN };
    expect(gradePick(badSpread, final(30, 20))).toEqual({ result: 'pending', points: 0 });

    const badTotal = { marketType: 'total' as const, selection: 'over', contestLine: NaN };
    expect(gradePick(badTotal, final(30, 20))).toEqual({ result: 'pending', points: 0 });
  });
});

describe('summarizeWeek', () => {
  it('totals points and counts each market separately', () => {
    const totals = summarizeWeek([
      { marketType: 'moneyline', result: 'win', points: 1 },
      { marketType: 'spread', result: 'win', points: 3 },
      { marketType: 'total', result: 'win', points: 3 },
      { marketType: 'spread', result: 'loss', points: 0 },
      { marketType: 'total', result: 'push', points: 0 },
      { marketType: 'moneyline', result: 'pending', points: 0 },
    ]);

    expect(totals).toEqual({
      pickemPoints: 7,
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
    const totals = summarizeWeek([{ marketType: 'spread', result: 'push', points: 0 }]);
    expect(totals.wins).toBe(0);
    expect(totals.correctSpread).toBe(0);
  });
});

describe('rankWeek', () => {
  it('ranks by points descending', () => {
    const standings = rankWeek([
      { userId: 'b', totalPoints: 10, wins: 3 },
      { userId: 'a', totalPoints: 16, wins: 4 },
      { userId: 'c', totalPoints: 5, wins: 2 },
    ]);
    expect(standings.map((s) => s.userId)).toEqual(['a', 'b', 'c']);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 3]);
  });

  it('shares a rank on a tie and skips the consumed place', () => {
    const standings = rankWeek([
      { userId: 'a', totalPoints: 16, wins: 4 },
      { userId: 'b', totalPoints: 10, wins: 3 },
      { userId: 'c', totalPoints: 10, wins: 3 },
      { userId: 'd', totalPoints: 5, wins: 2 },
    ]);
    expect(standings.map((s) => s.rank)).toEqual([1, 2, 2, 4]);
  });

  it('makes every player tied at the top a winner', () => {
    // The weekly prize is split rather than handed to whoever sorted first.
    const standings = rankWeek([
      { userId: 'a', totalPoints: 16, wins: 4 },
      { userId: 'b', totalPoints: 16, wins: 4 },
      { userId: 'c', totalPoints: 9, wins: 3 },
    ]);
    expect(standings.filter((s) => s.isWinner).map((s) => s.userId)).toEqual(['a', 'b']);
  });

  it('breaks a points tie on wins before falling back to id', () => {
    const standings = rankWeek([
      { userId: 'a', totalPoints: 10, wins: 2 },
      { userId: 'b', totalPoints: 10, wins: 6 },
    ]);
    expect(standings[0]).toMatchObject({ userId: 'b', rank: 1, isWinner: true });
    expect(standings[1]).toMatchObject({ userId: 'a', rank: 2, isWinner: false });
  });

  it('produces identical ranks on a replay', () => {
    // Grading can re-run after a score correction; ordering must be total, or
    // tied players would swap ranks between runs.
    const entries = [
      { userId: 'zeta', totalPoints: 10, wins: 3 },
      { userId: 'alpha', totalPoints: 10, wins: 3 },
      { userId: 'mid', totalPoints: 10, wins: 3 },
    ];
    const first = rankWeek(entries);
    const second = rankWeek([...entries].reverse());
    expect(second).toEqual(first);
    expect(first.map((s) => s.userId)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('does not mutate its input', () => {
    const entries = [
      { userId: 'a', totalPoints: 5, wins: 1 },
      { userId: 'b', totalPoints: 10, wins: 2 },
    ];
    rankWeek(entries);
    expect(entries[0]!.userId).toBe('a');
  });

  it('handles an empty league', () => {
    expect(rankWeek([])).toEqual([]);
  });
});

describe('TD Scorer tiers', () => {
  it('buckets by how often a player actually scores', () => {
    // 6 TDs in 8 games = 0.75 → scores most weeks → cheapest.
    expect(tdTierFor(6, 8)).toBe('lock');
    // 3 in 8 = 0.375 → middle.
    expect(tdTierFor(3, 8)).toBe('solid');
    // 1 in 8 = 0.125 → rare → pays most.
    expect(tdTierFor(1, 8)).toBe('longshot');
  });

  it('pays the inverse of reliability', () => {
    expect(tdPointsFor(6, 8)).toBe(2);
    expect(tdPointsFor(3, 8)).toBe(4);
    expect(tdPointsFor(1, 8)).toBe(8);
  });

  it('puts a player with too few games in the middle, not the long shots', () => {
    // One quiet appearance should not brand someone a long shot.
    expect(tdTierFor(0, 1)).toBe('solid');
    expect(tdTierFor(0, 2)).toBe('solid');
    expect(tdTierFor(0, 0)).toBe('solid');
  });

  it('applies the thresholds inclusively at the boundaries', () => {
    expect(tdTierFor(2, 4)).toBe('lock');     // exactly 0.50
    expect(tdTierFor(1, 4)).toBe('solid');    // exactly 0.25
    expect(tdTierFor(3, 13)).toBe('longshot'); // just under 0.25
  });

  it('never exceeds a full Pick’em card', () => {
    // The old formula topped out at 30, so one TD pick could outweigh the whole
    // week. The most expensive tier is now 8.
    const mostExpensive = Math.max(...Object.values(TD_TIERS).map((t) => t.points));
    expect(mostExpensive).toBe(8);
    expect(mostExpensive).toBeLessThan(5 * MARKET_POINTS.spread);
  });
});
