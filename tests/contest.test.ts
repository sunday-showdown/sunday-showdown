import { describe, it, expect } from 'vitest';
import {
  easternParts,
  isSundayInEastern,
  computeLockTime,
  resolveLockTime,
  isCardLocked,
  isGamePickable,
  timeUntilLock,
} from '../lib/contest';

// Real Week 5 2026 kickoffs, taken from the ESPN feed.
const THU_NIGHT = '2026-10-09T00:15Z'; // Thu Oct 8, 8:15pm EDT
const SUN_EARLY = '2026-10-11T17:00Z'; // Sun Oct 11, 1:00pm EDT
const SUN_LATE = '2026-10-11T20:05Z'; // Sun Oct 11, 4:05pm EDT
const SUN_NIGHT = '2026-10-12T00:20Z'; // Sun Oct 11, 8:20pm EDT — Monday in UTC
const MON_NIGHT = '2026-10-13T00:15Z'; // Mon Oct 12, 8:15pm EDT

describe('easternParts', () => {
  it('converts a UTC instant to Eastern calendar parts', () => {
    expect(easternParts(new Date(SUN_EARLY))).toMatchObject({
      weekday: 'Sun',
      year: 2026,
      month: 10,
      day: 11,
      hour: 13,
      minute: 0,
    });
  });

  it('reports a Sunday night game as Sunday even though UTC says Monday', () => {
    // 00:20Z Monday is 8:20pm Sunday in Eastern. Getting this wrong would push
    // the lock to the following week.
    expect(easternParts(new Date(SUN_NIGHT))).toMatchObject({
      weekday: 'Sun',
      day: 11,
      hour: 20,
    });
  });

  it('reports a Thursday night game as Thursday even though UTC says Friday', () => {
    expect(easternParts(new Date(THU_NIGHT))).toMatchObject({
      weekday: 'Thu',
      day: 8,
      hour: 20,
    });
  });
});

describe('isSundayInEastern', () => {
  it('identifies Sunday games across the whole Sunday slate', () => {
    expect(isSundayInEastern(new Date(SUN_EARLY))).toBe(true);
    expect(isSundayInEastern(new Date(SUN_LATE))).toBe(true);
    expect(isSundayInEastern(new Date(SUN_NIGHT))).toBe(true);
  });

  it('excludes Thursday and Monday games', () => {
    expect(isSundayInEastern(new Date(THU_NIGHT))).toBe(false);
    expect(isSundayInEastern(new Date(MON_NIGHT))).toBe(false);
  });
});

describe('computeLockTime', () => {
  it('locks at the first Sunday kickoff, not the first game of the week', () => {
    // The defining rule: a Thursday game must not lock the card.
    const lock = computeLockTime([MON_NIGHT, SUN_LATE, THU_NIGHT, SUN_EARLY, SUN_NIGHT]);
    expect(lock?.toISOString()).toBe(new Date(SUN_EARLY).toISOString());
  });

  it('ignores order of input', () => {
    const a = computeLockTime([SUN_NIGHT, SUN_EARLY, SUN_LATE]);
    const b = computeLockTime([SUN_LATE, SUN_NIGHT, SUN_EARLY]);
    expect(a?.toISOString()).toBe(b?.toISOString());
  });

  it('returns null for a week with no Sunday games', () => {
    expect(computeLockTime([THU_NIGHT, MON_NIGHT])).toBeNull();
    expect(computeLockTime([])).toBeNull();
  });

  it('skips unparseable kickoffs', () => {
    const lock = computeLockTime(['not a date', SUN_EARLY]);
    expect(lock?.toISOString()).toBe(new Date(SUN_EARLY).toISOString());
  });

  it('accepts Date objects as well as strings', () => {
    expect(computeLockTime([new Date(SUN_EARLY)])?.toISOString()).toBe(
      new Date(SUN_EARLY).toISOString(),
    );
  });
});

describe('resolveLockTime', () => {
  it('matches computeLockTime when Sunday games exist', () => {
    expect(resolveLockTime([THU_NIGHT, SUN_EARLY])?.toISOString()).toBe(
      new Date(SUN_EARLY).toISOString(),
    );
  });

  it('falls back to the earliest kickoff when a week has no Sunday games', () => {
    // A Saturday-only playoff week must still lock, not stay open forever.
    expect(resolveLockTime([MON_NIGHT, THU_NIGHT])?.toISOString()).toBe(
      new Date(THU_NIGHT).toISOString(),
    );
  });

  it('returns null for an empty week', () => {
    expect(resolveLockTime([])).toBeNull();
  });
});

describe('isCardLocked', () => {
  const lock = new Date(SUN_EARLY);

  it('is open before the lock and locked after', () => {
    expect(isCardLocked(lock, new Date('2026-10-11T16:59:59Z'))).toBe(false);
    expect(isCardLocked(lock, new Date('2026-10-11T17:00:01Z'))).toBe(true);
  });

  it('locks exactly at kickoff', () => {
    // Inclusive: at the instant of kickoff the card is shut.
    expect(isCardLocked(lock, new Date(SUN_EARLY))).toBe(true);
  });

  it('treats a missing lock as open', () => {
    expect(isCardLocked(null)).toBe(false);
  });
});

describe('isGamePickable', () => {
  const lock = SUN_EARLY;

  it('allows a Sunday game while the card is open', () => {
    expect(isGamePickable(SUN_LATE, lock, new Date('2026-10-10T12:00Z'))).toBe(true);
  });

  it('closes a Thursday game once it has kicked off, card still open', () => {
    // Friday: the Thursday game is done but the rest of the card is live.
    const friday = new Date('2026-10-09T14:00Z');
    expect(isCardLocked(lock, friday)).toBe(false);
    expect(isGamePickable(THU_NIGHT, lock, friday)).toBe(false);
    expect(isGamePickable(SUN_EARLY, lock, friday)).toBe(true);
  });

  it('closes every game once the card locks', () => {
    const sundayAfternoon = new Date('2026-10-11T18:00Z');
    expect(isGamePickable(SUN_NIGHT, lock, sundayAfternoon)).toBe(false);
    expect(isGamePickable(MON_NIGHT, lock, sundayAfternoon)).toBe(false);
  });

  it('closes a game at its own kickoff instant', () => {
    expect(isGamePickable(THU_NIGHT, lock, new Date(THU_NIGHT))).toBe(false);
  });
});

describe('timeUntilLock', () => {
  it('counts down to the lock', () => {
    const ms = timeUntilLock(SUN_EARLY, new Date('2026-10-11T16:00Z'));
    expect(ms).toBe(60 * 60 * 1000);
  });

  it('is zero once locked, never negative', () => {
    expect(timeUntilLock(SUN_EARLY, new Date('2026-10-12T00:00Z'))).toBe(0);
  });

  it('is zero with no lock set', () => {
    expect(timeUntilLock(null)).toBe(0);
  });
});
