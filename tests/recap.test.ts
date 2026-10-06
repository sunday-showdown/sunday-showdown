import { describe, it, expect } from 'vitest';
import { summarisePicks, recapHeadline, type RecapPick } from '../lib/recap';

const pick = (over: Partial<RecapPick>): RecapPick => ({
  gameId: 'g1',
  market: 'moneyline',
  label: 'KC to win',
  matchup: 'LV at KC',
  homeAbbr: 'KC',
  awayAbbr: 'LV',
  homeScore: 27,
  awayScore: 17,
  odds: -150,
  result: 'win',
  points: 17,
  atStake: 17,
  ...over,
});

describe('summarisePicks', () => {
  it('counts each result and totals the points', () => {
    const summary = summarisePicks([
      pick({ result: 'win', points: 19 }),
      pick({ result: 'loss', points: 0 }),
      pick({ result: 'push', points: 10 }),
      pick({ result: 'pending', points: 0 }),
    ]);

    expect(summary).toMatchObject({ wins: 1, losses: 1, pushes: 1, pending: 1, points: 29 });
  });

  it('excludes pushes and pending picks from the hit rate', () => {
    // A push is neither a hit nor a miss — counting it either way would make a
    // card of three pushes and one win read as 25% or 100%.
    const summary = summarisePicks([
      pick({ result: 'win' }),
      pick({ result: 'loss' }),
      pick({ result: 'push' }),
      pick({ result: 'pending' }),
    ]);
    expect(summary.hitRate).toBe(0.5);
  });

  it('has no hit rate before anything is decided', () => {
    expect(summarisePicks([pick({ result: 'pending' })]).hitRate).toBeNull();
    expect(summarisePicks([]).hitRate).toBeNull();
  });

  it('calls the biggest payout the best pick', () => {
    const summary = summarisePicks([
      pick({ label: 'small', result: 'win', points: 12 }),
      pick({ label: 'big', result: 'win', points: 46 }),
    ]);
    expect(summary.best?.label).toBe('big');
  });

  it('calls the costliest loss the worst pick, not just any loss', () => {
    // Every card has losses; only the one that would have paid most stings.
    const summary = summarisePicks([
      pick({ label: 'cheap miss', result: 'loss', points: 0, atStake: 15 }),
      pick({ label: 'the one that hurt', result: 'loss', points: 0, atStake: 68 }),
    ]);
    expect(summary.worst?.label).toBe('the one that hurt');
  });

  it('never nominates a loss as best or a win as worst', () => {
    const summary = summarisePicks([pick({ result: 'loss', points: 0, atStake: 90 })]);
    expect(summary.best).toBeNull();
    expect(summary.worst?.atStake).toBe(90);

    const clean = summarisePicks([pick({ result: 'win', points: 30 })]);
    expect(clean.worst).toBeNull();
  });

  it('rounds the total, because a leaderboard of 18.3 reads like homework', () => {
    expect(summarisePicks([pick({ points: 19.4 }), pick({ points: 19.4 })]).points).toBe(39);
  });
});

describe('recapHeadline', () => {
  const base = { rank: 4, fieldSize: 6, points: 92, movement: null, isWinner: false };

  it('leads with the win', () => {
    expect(recapHeadline({ ...base, rank: 1, isWinner: true, points: 140 })).toBe(
      'You won the week with 140.',
    );
  });

  it('treats first place as a win even if the flag is not set', () => {
    // A week graded before the winner flag was written must not read as "4th".
    expect(recapHeadline({ ...base, rank: 1, isWinner: false })).toContain('won the week');
  });

  it('says you sat it out when there is no rank', () => {
    expect(recapHeadline({ ...base, rank: null })).toBe('You sat this one out.');
  });

  it('reports a climb and a slip in the right direction', () => {
    expect(recapHeadline({ ...base, movement: 2 })).toContain('climbed 2 places');
    expect(recapHeadline({ ...base, movement: -1 })).toContain('slipped 1 place');
  });

  it('singularises one place', () => {
    expect(recapHeadline({ ...base, movement: 1 })).toContain('1 place.');
    expect(recapHeadline({ ...base, movement: 1 })).not.toContain('1 places');
  });

  it('falls back to the placing when nobody moved', () => {
    expect(recapHeadline({ ...base, movement: 0 })).toBe('4th of 6 with 92.');
  });

  it('omits the field size when it is unknown', () => {
    expect(recapHeadline({ ...base, fieldSize: 0, movement: 0 })).toBe('4th with 92.');
  });
});
