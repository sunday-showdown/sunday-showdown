import { describe, it, expect } from 'vitest';
import {
  MAX_HP,
  WEEKLY_CAP,
  SEASON_ROUND_CAP,
  capFor,
  roundDamage,
  playBattle,
  battleOutcome,
  describeDamage,
  hpTone,
  isCloseFight,
  type Round,
} from '../lib/battle';

const round = (over: Partial<Round> & { week: number }): Round => ({
  challengerPoints: 0,
  opponentPoints: 0,
  challengerDamage: 0,
  opponentDamage: 0,
  ...over,
});

describe('roundDamage', () => {
  it('lands the whole cap when the opponent scored nothing', () => {
    expect(roundDamage(120, 0, WEEKLY_CAP)).toEqual({ challenger: 100, opponent: 0 });
  });

  it('only the leader deals damage', () => {
    // Splitting the gap between both sides would double-count it, and a season
    // of even weeks would kill both fighters at once.
    const result = roundDamage(40, 60, WEEKLY_CAP);
    expect(result.challenger).toBe(0);
    expect(result.opponent).toBeGreaterThan(0);
  });

  it('is scale free: the same ratio does the same damage', () => {
    // A two-game Thursday card and a full Sunday card pay wildly different
    // absolute points, so damage has to come from the ratio or late-season byes
    // would feel like pillow fights.
    expect(roundDamage(6, 4, WEEKLY_CAP)).toEqual(roundDamage(600, 400, WEEKLY_CAP));
  });

  it('does nothing on a draw', () => {
    expect(roundDamage(88, 88, WEEKLY_CAP)).toEqual({ challenger: 0, opponent: 0 });
  });

  it('treats a week nobody played as a draw rather than dividing by zero', () => {
    expect(roundDamage(0, 0, WEEKLY_CAP)).toEqual({ challenger: 0, opponent: 0 });
  });

  it('decides a one-point margin, gently', () => {
    const result = roundDamage(61, 60, WEEKLY_CAP);
    expect(result.challenger).toBe(1);
    expect(result.opponent).toBe(0);
  });

  it('never exceeds the cap', () => {
    for (const [mine, theirs] of [
      [1000, 0],
      [0, 1000],
      [1, 0],
    ] as const) {
      const result = roundDamage(mine, theirs, SEASON_ROUND_CAP);
      expect(result.challenger).toBeLessThanOrEqual(SEASON_ROUND_CAP);
      expect(result.opponent).toBeLessThanOrEqual(SEASON_ROUND_CAP);
    }
  });

  it('ignores negative and non-finite scores rather than paying them out', () => {
    expect(roundDamage(Number.NaN, 50, WEEKLY_CAP)).toEqual({ challenger: 0, opponent: 100 });
    expect(roundDamage(-40, 0, WEEKLY_CAP)).toEqual({ challenger: 0, opponent: 0 });
  });

  it('needs three flawless weeks for a season knockout', () => {
    // The season cap is set so a mauling can end early without a single bad
    // week ending an eighteen-week fight.
    expect(SEASON_ROUND_CAP * 3).toBeGreaterThanOrEqual(MAX_HP);
    expect(SEASON_ROUND_CAP * 2).toBeLessThan(MAX_HP);
  });

  it('caps by duration', () => {
    expect(capFor('week')).toBe(WEEKLY_CAP);
    expect(capFor('season')).toBe(SEASON_ROUND_CAP);
  });
});

describe('playBattle', () => {
  it('starts both fighters at full health', () => {
    const state = playBattle([]);
    expect(state.challengerHp).toBe(MAX_HP);
    expect(state.opponentHp).toBe(MAX_HP);
    expect(state.leader).toBeNull();
  });

  it('subtracts damage taken, not damage dealt', () => {
    const state = playBattle([round({ week: 1, challengerDamage: 30 })]);
    expect(state.opponentHp).toBe(70);
    expect(state.challengerHp).toBe(MAX_HP);
    expect(state.leader).toBe('challenger');
  });

  it('accumulates across rounds', () => {
    const state = playBattle([
      round({ week: 1, challengerDamage: 20 }),
      round({ week: 2, opponentDamage: 12 }),
      round({ week: 3, challengerDamage: 15 }),
    ]);
    expect(state.challengerDamage).toBe(35);
    expect(state.opponentDamage).toBe(12);
    expect(state.opponentHp).toBe(65);
    expect(state.challengerHp).toBe(88);
  });

  it('attributes the knockout to the week it happened in, whatever order rows arrive', () => {
    const rounds = [
      round({ week: 3, challengerDamage: 34 }),
      round({ week: 1, challengerDamage: 34 }),
      round({ week: 2, challengerDamage: 34 }),
    ];
    expect(playBattle(rounds).knockoutWeek).toBe(3);
    expect(playBattle([...rounds].reverse()).knockoutWeek).toBe(3);
  });

  it('stops at the knockout, so a late row cannot change who won', () => {
    const state = playBattle([
      round({ week: 1, challengerDamage: 100 }),
      round({ week: 2, opponentDamage: 100 }),
    ]);
    expect(state.knockoutWeek).toBe(1);
    expect(state.opponentHp).toBe(0);
    expect(state.challengerHp).toBe(MAX_HP);
    expect(state.leader).toBe('challenger');
  });

  it('floors health at zero rather than going negative', () => {
    const state = playBattle([round({ week: 1, challengerDamage: 140 })]);
    expect(state.opponentHp).toBe(0);
  });
});

describe('battleOutcome', () => {
  it('stays pending while rounds remain and both are standing', () => {
    const state = playBattle([round({ week: 1, challengerDamage: 30 })]);
    expect(battleOutcome(state, 14)).toBe('pending');
  });

  it('ends on a knockout even with rounds to spare', () => {
    const state = playBattle([round({ week: 1, challengerDamage: 100 })]);
    expect(battleOutcome(state, 14)).toBe('challenger');
  });

  it('decides on health left once the rounds run out', () => {
    const state = playBattle([
      round({ week: 1, challengerDamage: 20 }),
      round({ week: 2, opponentDamage: 30 }),
    ]);
    expect(battleOutcome(state, 0)).toBe('opponent');
  });

  it('is a tie when neither fighter was ever hit', () => {
    expect(battleOutcome(playBattle([round({ week: 1 })]), 0)).toBe('tie');
  });

  it('settles a weekly duel from its single round', () => {
    // A weekly duel has no rounds remaining by definition, so one round always
    // produces a verdict rather than leaving the duel open forever.
    const damage = roundDamage(94, 61, WEEKLY_CAP);
    const state = playBattle([
      round({ week: 5, challengerDamage: damage.challenger, opponentDamage: damage.opponent }),
    ]);
    expect(battleOutcome(state, 0)).toBe('challenger');
  });
});

describe('describeDamage and hpTone', () => {
  it('names a full-cap hit a knockout', () => {
    expect(describeDamage(MAX_HP)).toBe('Knockout');
  });

  it('calls nothing landing blocked', () => {
    expect(describeDamage(0)).toBe('Blocked');
  });

  it('rises monotonically through the bands', () => {
    const order = ['Blocked', 'Glancing blow', 'Clean hit', 'Crushing', 'Devastating', 'Knockout'];
    const seen = [0, 5, 20, 40, 70, 100].map(describeDamage);
    expect(seen).toEqual(order);
  });

  it('tones health so the colour cannot disagree with the number', () => {
    expect(hpTone(100)).toBe('healthy');
    expect(hpTone(55)).toBe('hurt');
    expect(hpTone(12)).toBe('critical');
    expect(hpTone(0)).toBe('down');
  });
});

describe('isCloseFight', () => {
  it('calls a near-level score close', () => {
    expect(isCloseFight(104, 98)).toBe(true);
  });

  it('does not call a rout close', () => {
    expect(isCloseFight(190, 70)).toBe(false);
  });

  it('scales with the size of the week rather than using a flat gap', () => {
    // 14 points apart is a photo finish on a 200-point card and nothing like
    // one on a 30-point Thursday.
    expect(isCloseFight(200, 186)).toBe(true);
    expect(isCloseFight(30, 16)).toBe(false);
  });

  it('keeps a floor, so tiny slates are not all "close"', () => {
    expect(isCloseFight(20, 12)).toBe(true);
    expect(isCloseFight(20, 5)).toBe(false);
  });

  it('says nothing while either side is still on zero', () => {
    // "Your duel is close at 0-0" is not news.
    expect(isCloseFight(0, 0)).toBe(false);
    expect(isCloseFight(44, 0)).toBe(false);
  });

  it('is symmetric', () => {
    expect(isCloseFight(118, 112)).toBe(isCloseFight(112, 118));
  });

  it('ignores nonsense rather than reporting it as close', () => {
    expect(isCloseFight(Number.NaN, 50)).toBe(false);
  });
});
