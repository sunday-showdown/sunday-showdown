import { describe, it, expect } from 'vitest';
import { windowFor, REMINDER_WINDOWS } from '../lib/reminders';

describe('windowFor', () => {
  it('matches the hour leading up to each mark', () => {
    expect(windowFor(24)).toBe(24);
    expect(windowFor(23.5)).toBe(24);
    expect(windowFor(2)).toBe(2);
    expect(windowFor(1.5)).toBe(2);
  });

  it('ignores times that are not near a window', () => {
    expect(windowFor(12)).toBeNull();
    expect(windowFor(5)).toBeNull();
    expect(windowFor(48)).toBeNull();
  });

  it('never fires once the lock has passed', () => {
    expect(windowFor(0)).toBeNull();
    expect(windowFor(-1)).toBeNull();
  });

  it('returns the same window across a five-minute cadence', () => {
    // The cron runs every few minutes and will keep finding the same window;
    // the notification key is what makes all but the first a no-op.
    const marks = [1.9, 1.8, 1.5, 1.1].map(windowFor);
    expect(new Set(marks)).toEqual(new Set([2]));
  });

  it('keeps windows ordered furthest-first so the wider one is checked first', () => {
    expect([...REMINDER_WINDOWS]).toEqual([24, 2]);
  });
});
