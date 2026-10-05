import { describe, it, expect } from 'vitest';
import { buildWeeklyActivity, buildStreakActivity, buildSurvivorActivity } from '../lib/activity';

const usernames = new Map([
  ['u1', 'austin'],
  ['u2', 'brian'],
  ['u3', 'casey'],
]);

const pick = (over: Partial<Parameters<typeof buildWeeklyActivity>[0]['picks'][number]> = {}) => ({
  user_id: 'u1',
  league_id: 'lg',
  result: 'win',
  points: 19,
  contest_odds: -110,
  selection_label: 'KC -3',
  market_type: 'spread',
  ...over,
});

const base = {
  season: 2026,
  week: 5,
  leagueId: 'lg',
  usernames,
};

describe('buildWeeklyActivity', () => {
  it('announces the week winner', () => {
    const entries = buildWeeklyActivity({
      ...base,
      standings: [{ userId: 'u1', username: 'austin', totalPoints: 94, rank: 1, isWinner: true }],
      picks: [],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.message).toContain('austin won week 5 with 94 points');
    expect(entries[0]!.activityType).toBe('week_winner');
  });

  it('announces every player tied at the top', () => {
    const entries = buildWeeklyActivity({
      ...base,
      standings: [
        { userId: 'u1', username: 'austin', totalPoints: 94, rank: 1, isWinner: true },
        { userId: 'u2', username: 'brian', totalPoints: 94, rank: 1, isWinner: true },
        { userId: 'u3', username: 'casey', totalPoints: 40, rank: 3, isWinner: false },
      ],
      picks: [],
    });
    expect(entries.filter((e) => e.activityType === 'week_winner')).toHaveLength(2);
  });

  it('reports only the single biggest upset, not every long shot', () => {
    const entries = buildWeeklyActivity({
      ...base,
      standings: [],
      picks: [
        pick({ user_id: 'u1', contest_odds: 300, points: 40 }),
        pick({ user_id: 'u2', contest_odds: 600, points: 70, selection_label: 'NYJ ML' }),
        pick({ user_id: 'u3', contest_odds: 260, points: 36 }),
      ],
    });
    const upsets = entries.filter((e) => e.activityType === 'big_upset');
    expect(upsets).toHaveLength(1);
    expect(upsets[0]!.message).toContain('brian');
    expect(upsets[0]!.message).toContain('NYJ ML');
  });

  it('ignores short prices and losing picks as upsets', () => {
    const entries = buildWeeklyActivity({
      ...base,
      standings: [],
      picks: [
        pick({ contest_odds: 150 }),
        pick({ contest_odds: 900, result: 'loss', points: 0 }),
      ],
    });
    expect(entries.filter((e) => e.activityType === 'big_upset')).toHaveLength(0);
  });

  it('calls a perfect card only when it is actually one', () => {
    const entries = buildWeeklyActivity({
      ...base,
      standings: [],
      picks: Array.from({ length: 6 }, () => pick({ contest_odds: -110 })),
    });
    const perfect = entries.filter((e) => e.activityType === 'perfect_week');
    expect(perfect).toHaveLength(1);
    expect(perfect[0]!.message).toContain('6 for 6');
  });

  it('does not call a short card perfect', () => {
    // Three picks, all correct, is not a story.
    const entries = buildWeeklyActivity({
      ...base,
      standings: [],
      picks: Array.from({ length: 3 }, () => pick()),
    });
    expect(entries.filter((e) => e.activityType === 'perfect_week')).toHaveLength(0);
  });

  it('does not call a card perfect when one pick lost', () => {
    const entries = buildWeeklyActivity({
      ...base,
      standings: [],
      picks: [...Array.from({ length: 5 }, () => pick()), pick({ result: 'loss', points: 0 })],
    });
    expect(entries.filter((e) => e.activityType === 'perfect_week')).toHaveLength(0);
  });

  it('ignores pending picks when judging a perfect card', () => {
    const entries = buildWeeklyActivity({
      ...base,
      standings: [],
      picks: [...Array.from({ length: 5 }, () => pick()), pick({ result: 'pending', points: 0 })],
    });
    expect(entries.filter((e) => e.activityType === 'perfect_week')).toHaveLength(1);
  });

  it('gives every entry a stable dedup key', () => {
    const args = {
      ...base,
      standings: [{ userId: 'u1', username: 'austin', totalPoints: 94, rank: 1, isWinner: true }],
      picks: [pick({ contest_odds: 400 })],
    };
    // Regenerating the same week must produce identical keys, or the cron
    // would duplicate the feed every few minutes.
    expect(buildWeeklyActivity(args).map((e) => e.dedupKey)).toEqual(
      buildWeeklyActivity(args).map((e) => e.dedupKey),
    );
  });
});

describe('buildStreakActivity', () => {
  it('reports a streak once it is worth reporting', () => {
    const entries = buildStreakActivity({
      ...base,
      streaks: [
        { userId: 'u1', username: 'austin', streak: 4 },
        { userId: 'u2', username: 'brian', streak: 2 },
      ],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.message).toContain('4-pick heater');
  });

  it('keys on the streak length so each new rung is its own entry', () => {
    const four = buildStreakActivity({ ...base, streaks: [{ userId: 'u1', username: 'a', streak: 4 }] });
    const five = buildStreakActivity({ ...base, streaks: [{ userId: 'u1', username: 'a', streak: 5 }] });
    expect(four[0]!.dedupKey).not.toBe(five[0]!.dedupKey);
  });
});

describe('buildSurvivorActivity', () => {
  const survivorBase = { ...base, poolName: 'Last One Standing', poolId: 'pool1' };

  it('reports each elimination', () => {
    const entries = buildSurvivorActivity({
      ...survivorBase,
      eliminated: [
        { userId: 'u1', username: 'austin', teamAbbr: 'KC' },
        { userId: 'u2', username: 'brian', teamAbbr: 'SF' },
      ],
      winner: null,
    });
    expect(entries).toHaveLength(2);
    expect(entries[0]!.message).toContain('austin went out');
    expect(entries[0]!.message).toContain('KC');
  });

  it('reports a pool winner', () => {
    const entries = buildSurvivorActivity({
      ...survivorBase,
      eliminated: [],
      winner: { userId: 'u3', username: 'casey' },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.message).toContain('casey is the last one standing');
  });

  it('keys eliminations per pool so a player can go out of two pools', () => {
    const a = buildSurvivorActivity({ ...survivorBase, eliminated: [{ userId: 'u1', username: 'a', teamAbbr: 'KC' }], winner: null });
    const b = buildSurvivorActivity({ ...survivorBase, poolId: 'pool2', eliminated: [{ userId: 'u1', username: 'a', teamAbbr: 'KC' }], winner: null });
    expect(a[0]!.dedupKey).not.toBe(b[0]!.dedupKey);
  });
});
