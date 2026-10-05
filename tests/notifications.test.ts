import { describe, it, expect } from 'vitest';
import { buildWeeklyNotifications, buildLockReminders, ordinal } from '../lib/notifications';

describe('ordinal', () => {
  it('handles the normal cases', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(21)).toBe('21st');
  });

  it('handles the teens, which are the trap', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(111)).toBe('111th');
  });
});

describe('buildWeeklyNotifications', () => {
  const standings = [
    { userId: 'u1', username: 'austin', totalPoints: 94, rank: 1, isWinner: true },
    { userId: 'u2', username: 'brian', totalPoints: 61, rank: 2, isWinner: false },
  ];

  it('congratulates the winner and reports to everyone else', () => {
    const notes = buildWeeklyNotifications({ season: 2026, week: 5, standings });
    expect(notes[0]).toMatchObject({ userId: 'u1', type: 'first_place' });
    expect(notes[0]!.title).toContain('You won week 5');
    expect(notes[1]).toMatchObject({ userId: 'u2', type: 'weekly_results' });
    expect(notes[1]!.message).toContain('2nd');
  });

  it('keys per user per week so grading cannot re-notify', () => {
    // Grading runs every few minutes; without a stable key the bell would fill
    // with duplicates of one result.
    const first = buildWeeklyNotifications({ season: 2026, week: 5, standings });
    const second = buildWeeklyNotifications({ season: 2026, week: 5, standings });
    expect(first.map((n) => n.key)).toEqual(second.map((n) => n.key));
    expect(new Set(first.map((n) => n.key)).size).toBe(2);
  });

  it('keys differently across weeks', () => {
    const w5 = buildWeeklyNotifications({ season: 2026, week: 5, standings });
    const w6 = buildWeeklyNotifications({ season: 2026, week: 6, standings });
    expect(w5[0]!.key).not.toBe(w6[0]!.key);
  });
});

describe('buildLockReminders', () => {
  it('says something different to someone who has not started', () => {
    const notes = buildLockReminders({
      season: 2026,
      week: 5,
      hoursLeft: 2,
      incomplete: [
        { userId: 'u1', picked: 0, total: 15 },
        { userId: 'u2', picked: 12, total: 15 },
      ],
    });
    expect(notes[0]!.message).toContain('not picked');
    expect(notes[1]!.message).toContain('3 games still open');
  });

  it('keys to the window so repeated runs do not nag', () => {
    const args = { season: 2026, week: 5, hoursLeft: 2, incomplete: [{ userId: 'u1', picked: 0, total: 15 }] };
    expect(buildLockReminders(args)[0]!.key).toBe(buildLockReminders(args)[0]!.key);
    expect(buildLockReminders({ ...args, hoursLeft: 24 })[0]!.key).not.toBe(
      buildLockReminders(args)[0]!.key,
    );
  });

  it('singularises one remaining game', () => {
    const notes = buildLockReminders({
      season: 2026,
      week: 5,
      hoursLeft: 2,
      incomplete: [{ userId: 'u1', picked: 14, total: 15 }],
    });
    expect(notes[0]!.message).toContain('1 game still open');
  });
});
