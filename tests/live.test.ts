import { describe, it, expect } from 'vitest';
import { liveState, liveValue, summarizeLive, type LivePick } from '../lib/live';

const pending = (over: Partial<LivePick> = {}): LivePick => ({
  marketType: 'spread',
  selection: 'home',
  contestLine: -3,
  contestOdds: -110,
  result: 'pending',
  points: 0,
  ...over,
});

const inProgress = (homeScore: number, awayScore: number) => ({
  status: 'in_progress',
  homeScore,
  awayScore,
});

describe('liveState', () => {
  it('says winning, never won, while a game is in progress', () => {
    // A halftime lead is not a result. Calling it one is exactly the mistake
    // the grading engine refuses to make.
    expect(liveState(pending(), inProgress(21, 10))).toBe('winning');
  });

  it('tracks a spread against the stored line', () => {
    expect(liveState(pending({ contestLine: -3 }), inProgress(24, 20))).toBe('winning');
    expect(liveState(pending({ contestLine: -7 }), inProgress(24, 20))).toBe('losing');
    expect(liveState(pending({ contestLine: -4 }), inProgress(24, 20))).toBe('tied');
  });

  it('tracks a total', () => {
    const over = pending({ marketType: 'total', selection: 'over', contestLine: 44 });
    expect(liveState(over, inProgress(28, 20))).toBe('winning');
    expect(liveState(over, inProgress(10, 7))).toBe('losing');
  });

  it('tracks a moneyline', () => {
    const ml = pending({ marketType: 'moneyline', selection: 'away', contestLine: null });
    expect(liveState(ml, inProgress(10, 21))).toBe('winning');
    expect(liveState(ml, inProgress(21, 10))).toBe('losing');
    expect(liveState(ml, inProgress(14, 14))).toBe('tied');
  });

  it('reports a graded pick as settled whatever the score says', () => {
    expect(liveState(pending({ result: 'win', points: 19 }), inProgress(0, 40))).toBe('settled');
    expect(liveState(pending({ result: 'loss' }), inProgress(40, 0))).toBe('settled');
  });

  it('waits on a game that has not started', () => {
    expect(liveState(pending(), { status: 'scheduled', homeScore: null, awayScore: null })).toBe('waiting');
    expect(liveState(pending(), { status: 'postponed', homeScore: null, awayScore: null })).toBe('waiting');
  });

  it('waits rather than guessing when data is unusable', () => {
    expect(liveState(pending(), inProgress(NaN, 10))).toBe('waiting');
    expect(liveState(pending({ contestLine: null }), inProgress(21, 10))).toBe('waiting');
    expect(liveState(pending({ selection: 'nonsense' }), inProgress(21, 10))).toBe('waiting');
  });
});

describe('liveValue', () => {
  it('shows what a pick is currently worth', () => {
    expect(liveValue(pending({ contestOdds: 400 }), inProgress(21, 10))).toBe(50);
  });

  it('is zero while a pick is behind', () => {
    expect(liveValue(pending({ contestOdds: 400 }), inProgress(0, 30))).toBe(0);
  });

  it('uses the real points once settled', () => {
    expect(liveValue(pending({ result: 'win', points: 19 }), inProgress(0, 0))).toBe(19);
  });
});

describe('summarizeLive', () => {
  it('keeps banked points separate from what is merely on track', () => {
    // Showing one total would imply a score that has not been earned.
    const summary = summarizeLive([
      { pick: pending({ result: 'win', points: 19 }), game: inProgress(0, 0) },
      { pick: pending({ contestOdds: -110 }), game: inProgress(24, 10) },
      { pick: pending({ contestOdds: 400 }), game: inProgress(0, 30) },
      { pick: pending(), game: { status: 'scheduled', homeScore: null, awayScore: null } },
    ]);

    expect(summary.banked).toBe(19);
    expect(summary.inPlay).toBe(19);
    expect(summary.atRisk).toBe(50);
    expect(summary).toMatchObject({ settled: 1, live: 2, waiting: 1 });
  });

  it('returns zeroes for an empty card', () => {
    expect(summarizeLive([])).toEqual({
      banked: 0,
      inPlay: 0,
      atRisk: 0,
      settled: 0,
      live: 0,
      waiting: 0,
    });
  });

  it('counts a tied pick as live but not yet in play', () => {
    const summary = summarizeLive([
      { pick: pending({ contestLine: -4 }), game: inProgress(24, 20) },
    ]);
    expect(summary.live).toBe(1);
    expect(summary.inPlay).toBe(0);
    expect(summary.atRisk).toBeGreaterThan(0);
  });
});
