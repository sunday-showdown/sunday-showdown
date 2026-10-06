// Contest timing.
//
// The card locks once a week, at the first Sunday kickoff. A Thursday or
// Saturday game starting earlier does NOT lock the card — those games simply
// become unpickable on their own, while the rest of the slate stays open.
//
// "Sunday" means Sunday in US Eastern time, which is how the NFL schedule is
// defined. Deriving it from UTC would be wrong: a 1pm ET Sunday kickoff is
// 17:00 UTC Sunday, but a 8:15pm ET Sunday night game is 00:15 UTC *Monday*,
// and a Thursday night game is Friday in UTC.

const ET = 'America/New_York';

const ET_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: ET,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export interface EasternParts {
  weekday: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Break a instant into its Eastern-time calendar parts. */
export function easternParts(date: Date): EasternParts {
  const parts = new Map(
    ET_PARTS.formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  );
  return {
    weekday: parts.get('weekday') ?? '',
    year: Number(parts.get('year')),
    month: Number(parts.get('month')),
    day: Number(parts.get('day')),
    // Intl renders midnight as "24" in some environments.
    hour: Number(parts.get('hour')) % 24,
    minute: Number(parts.get('minute')),
  };
}

export function isSundayInEastern(date: Date): boolean {
  return easternParts(date).weekday === 'Sun';
}

/**
 * The weekly lock: the earliest Sunday kickoff on the slate.
 *
 * Returns null when a week has no Sunday games at all (which happens only for
 * oddities like a Saturday-only playoff week); callers then fall back to the
 * earliest kickoff of any day rather than leaving the week unlocked forever.
 */
export function computeLockTime(kickoffs: readonly (Date | string)[]): Date | null {
  const sundays = kickoffs
    .map((k) => (k instanceof Date ? k : new Date(k)))
    .filter((d) => !Number.isNaN(d.getTime()))
    .filter(isSundayInEastern)
    .sort((a, b) => a.getTime() - b.getTime());

  return sundays[0] ?? null;
}

/**
 * The lock for a week, with a fallback for weeks that have no Sunday games.
 */
export function resolveLockTime(kickoffs: readonly (Date | string)[]): Date | null {
  const sunday = computeLockTime(kickoffs);
  if (sunday) return sunday;

  const all = kickoffs
    .map((k) => (k instanceof Date ? k : new Date(k)))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  return all[0] ?? null;
}

/** Whether the card as a whole is locked. */
export function isCardLocked(lockTime: Date | string | null, now: Date = new Date()): boolean {
  if (!lockTime) return false;
  const lock = lockTime instanceof Date ? lockTime : new Date(lockTime);
  if (Number.isNaN(lock.getTime())) return false;
  return now.getTime() >= lock.getTime();
}

/**
 * Whether one game can still be picked.
 *
 * A game is pickable while the card is open AND its own kickoff is in the
 * future. The second half is what stops a Thursday game being picked on Friday
 * while the rest of the card remains open.
 */
/**
 * Which rule a league locks picks under.
 *
 * Mirrors leagues.lock_policy, and must agree with pick_lock_time() in
 * migration 0020 — the database decides what is actually allowed, and a UI that
 * disagrees either blocks a legal pick or offers an illegal one.
 */
export type LockPolicy = 'first_kickoff' | 'per_game';

export function isGamePickable(
  kickoff: Date | string,
  lockTime: Date | string | null,
  now: Date = new Date(),
  policy: LockPolicy = 'first_kickoff',
): boolean {
  // Under the per-game rule the contest's lock time is not consulted at all:
  // a Monday night game is pickable on Monday afternoon even though the card
  // "locked" on Sunday morning.
  if (policy !== 'per_game' && isCardLocked(lockTime, now)) return false;

  const start = kickoff instanceof Date ? kickoff : new Date(kickoff);
  if (Number.isNaN(start.getTime())) return false;
  return now.getTime() < start.getTime();
}

export interface CardLockState {
  /** Nothing on the card can still be picked. */
  allLocked: boolean;
  /** When the next thing locks, for the countdown. Null when nothing is left. */
  nextLockAt: Date | null;
  /** How many games are still open. */
  openCount: number;
}

/**
 * What the header should say about locking.
 *
 * Under the default rule this is just the contest's lock time, and the whole
 * card goes at once. Under the per-game rule there is no single moment: the
 * countdown has to point at the next kickoff still to come, and the card is
 * only finished once every game has started.
 */
export function cardLockState(
  kickoffs: readonly (Date | string)[],
  lockTime: Date | string | null,
  policy: LockPolicy = 'first_kickoff',
  now: Date = new Date(),
): CardLockState {
  if (policy !== 'per_game') {
    const locked = isCardLocked(lockTime, now);
    return {
      allLocked: locked,
      nextLockAt: locked || !lockTime ? null : new Date(lockTime),
      openCount: locked ? 0 : kickoffs.length,
    };
  }

  const upcoming = kickoffs
    .map((kickoff) => (kickoff instanceof Date ? kickoff : new Date(kickoff)))
    .filter((start) => !Number.isNaN(start.getTime()) && start.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    // A week with no schedule yet has not locked — it has not opened. Without
    // the length check those two are indistinguishable, and Home would tell
    // somebody their card was locked before a single game existed.
    allLocked: kickoffs.length > 0 && upcoming.length === 0,
    nextLockAt: upcoming[0] ?? null,
    openCount: upcoming.length,
  };
}

/** Milliseconds until the lock, or 0 once it has passed. */
export function timeUntilLock(lockTime: Date | string | null, now: Date = new Date()): number {
  if (!lockTime) return 0;
  const lock = lockTime instanceof Date ? lockTime : new Date(lockTime);
  if (Number.isNaN(lock.getTime())) return 0;
  return Math.max(0, lock.getTime() - now.getTime());
}
