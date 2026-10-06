import { describe, it, expect } from 'vitest';
import { settleChallenge, canonicalPair, isDuelDue } from '../lib/h2h';

describe('settleChallenge', () => {
  it('awards the higher score', () => {
    expect(settleChallenge(94, 61)).toBe('challenger');
    expect(settleChallenge(61, 94)).toBe('opponent');
  });

  it('calls equal scores a tie', () => {
    expect(settleChallenge(75, 75)).toBe('tie');
  });

  it('treats zero as a real score, not a missing one', () => {
    // Not picking is a choice, and it loses.
    expect(settleChallenge(0, 42)).toBe('opponent');
    expect(settleChallenge(42, 0)).toBe('challenger');
    expect(settleChallenge(0, 0)).toBe('tie');
  });

  it('stays pending while either side is ungraded', () => {
    expect(settleChallenge(null, 40)).toBe('pending');
    expect(settleChallenge(40, null)).toBe('pending');
    expect(settleChallenge(null, null)).toBe('pending');
  });

  it('decides on a one-point margin', () => {
    expect(settleChallenge(61, 60)).toBe('challenger');
  });
});

describe('canonicalPair', () => {
  it('orders a pair the same way regardless of argument order', () => {
    // h2h_records has a check constraint requiring user_a_id < user_b_id, so
    // one matchup can never become two rows disagreeing about the record.
    const forward = canonicalPair('aaa', 'bbb');
    const reverse = canonicalPair('bbb', 'aaa');
    expect(forward.userA).toBe(reverse.userA);
    expect(forward.userB).toBe(reverse.userB);
  });

  it('reports whether the arguments were swapped', () => {
    expect(canonicalPair('aaa', 'bbb').swapped).toBe(false);
    expect(canonicalPair('bbb', 'aaa').swapped).toBe(true);
  });

  it('always satisfies the constraint it exists to protect', () => {
    const ids = ['z9', 'a1', 'm5', '00', 'ff'];
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        const { userA, userB } = canonicalPair(a, b);
        expect(userA < userB).toBe(true);
      }
    }
  });
});

describe('isDuelDue', () => {
  it('plays a weekly duel only in its own week', () => {
    expect(isDuelDue({ duration: 'week', week: 5 }, 5)).toBe(true);
    expect(isDuelDue({ duration: 'week', week: 5 }, 6)).toBe(false);
    expect(isDuelDue({ duration: 'week', week: 5 }, 4)).toBe(false);
  });

  it('plays a season duel every week from the one it started in', () => {
    expect(isDuelDue({ duration: 'season', week: 5 }, 5)).toBe(true);
    expect(isDuelDue({ duration: 'season', week: 5 }, 12)).toBe(true);
  });

  it('never plays a season duel for a week before it was issued', () => {
    // Otherwise accepting a duel in week 10 would retroactively settle rounds
    // for weeks neither fighter had agreed to.
    expect(isDuelDue({ duration: 'season', week: 10 }, 3)).toBe(false);
  });
});
