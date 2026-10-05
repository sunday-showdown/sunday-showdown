import { describe, it, expect } from 'vitest';
import { gradeSurvivorPick, isAlive, usedTeams } from '../lib/survivor';

const final = (homeScore: number, awayScore: number) => ({
  status: 'final',
  homeScore,
  awayScore,
});

describe('gradeSurvivorPick', () => {
  it('survives when the picked team wins', () => {
    expect(gradeSurvivorPick(true, final(24, 17))).toBe('survived');
    expect(gradeSurvivorPick(false, final(17, 24))).toBe('survived');
  });

  it('eliminates when the picked team loses', () => {
    expect(gradeSurvivorPick(true, final(17, 24))).toBe('eliminated');
    expect(gradeSurvivorPick(false, final(24, 17))).toBe('eliminated');
  });

  it('keeps a player alive on a tie', () => {
    // Being knocked out by a tie is harsher than the format intends, and ties
    // are rare enough that the generous reading is the fair one.
    expect(gradeSurvivorPick(true, final(20, 20))).toBe('push');
    expect(gradeSurvivorPick(false, final(20, 20))).toBe('push');
  });

  it('stays pending until the game is final', () => {
    expect(gradeSurvivorPick(true, { status: 'scheduled', homeScore: null, awayScore: null })).toBe('pending');
    expect(gradeSurvivorPick(true, { status: 'in_progress', homeScore: 21, awayScore: 0 })).toBe('pending');
  });

  it('never eliminates on a lead that is not final', () => {
    // A team down 0-21 at half has not lost yet.
    expect(gradeSurvivorPick(false, { status: 'in_progress', homeScore: 21, awayScore: 0 })).toBe('pending');
  });

  it('stays pending when scores are missing or unusable', () => {
    expect(gradeSurvivorPick(true, { status: 'final', homeScore: null, awayScore: 10 })).toBe('pending');
    expect(gradeSurvivorPick(true, { status: 'final', homeScore: NaN, awayScore: 10 })).toBe('pending');
  });

  it('treats a 0-0 final as a real tie', () => {
    expect(gradeSurvivorPick(true, final(0, 0))).toBe('push');
  });

  it('counts a shutout win correctly', () => {
    expect(gradeSurvivorPick(true, final(14, 0))).toBe('survived');
    expect(gradeSurvivorPick(false, final(14, 0))).toBe('eliminated');
  });
});

describe('isAlive', () => {
  it('keeps a player alive through wins and ties', () => {
    expect(isAlive(['survived', 'survived', 'push'])).toBe(true);
  });

  it('eliminates on a single loss, whenever it happened', () => {
    expect(isAlive(['survived', 'eliminated', 'survived'])).toBe(false);
    expect(isAlive(['eliminated'])).toBe(false);
  });

  it('treats a player with no picks as alive', () => {
    expect(isAlive([])).toBe(true);
  });

  it('does not eliminate on a pending pick', () => {
    expect(isAlive(['survived', 'pending'])).toBe(true);
  });
});

describe('usedTeams', () => {
  it('collects every team already spent', () => {
    const used = usedTeams([{ team_abbr: 'KC' }, { team_abbr: 'BUF' }]);
    expect(used.has('KC')).toBe(true);
    expect(used.has('BUF')).toBe(true);
    expect(used.has('SF')).toBe(false);
  });

  it('is empty for a new entrant', () => {
    expect(usedTeams([]).size).toBe(0);
  });

  it('counts a repeated team once', () => {
    // The database forbids reuse, but the helper should not double-count if a
    // historical row ever slipped through.
    expect(usedTeams([{ team_abbr: 'KC' }, { team_abbr: 'KC' }]).size).toBe(1);
  });
});
