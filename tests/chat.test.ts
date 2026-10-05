import { describe, it, expect } from 'vitest';
import { extractMentions, excerpt, channelLabel, QUICK_REACTIONS } from '../lib/chat';
import type { ChannelSummary } from '../lib/chat';

describe('extractMentions', () => {
  it('finds a mention', () => {
    expect(extractMentions('nice call @dave')).toEqual(['dave']);
  });

  it('de-duplicates case-insensitively', () => {
    // "@Dave @dave" is one person being spoken to once, not two notifications.
    expect(extractMentions('@Dave are you there @dave')).toEqual(['dave']);
  });

  it('finds several, in order', () => {
    expect(extractMentions('@ann @bob you both lost')).toEqual(['ann', 'bob']);
  });

  it('ignores anything that is not a valid username', () => {
    // Usernames are 3-24 of [A-Za-z0-9_], enforced on profiles.
    expect(extractMentions('@ab too short')).toEqual([]);
    expect(extractMentions('@ and nothing')).toEqual([]);
    expect(extractMentions('email me at dave@example.com')).toEqual(['example']);
  });

  it('stops at punctuation and at the 24 character limit', () => {
    expect(extractMentions('@dave, you there?')).toEqual(['dave']);
    expect(extractMentions(`@${'a'.repeat(30)}`)).toEqual(['a'.repeat(24)]);
  });

  it('returns nothing for empty input', () => {
    expect(extractMentions(null)).toEqual([]);
    expect(extractMentions(undefined)).toEqual([]);
    expect(extractMentions('')).toEqual([]);
  });
});

describe('excerpt', () => {
  it('describes a non-text message by its kind', () => {
    expect(excerpt({ kind: 'image', body: null })).toBe('📷 Image');
    expect(excerpt({ kind: 'bet_slip', body: null })).toBe('🎟️ Bet slip');
  });

  it('says so when a message was deleted, whatever it held', () => {
    expect(excerpt({ kind: 'text', body: 'secret', deleted: true })).toBe('Message deleted');
    expect(excerpt({ kind: 'image', body: null, deleted: true })).toBe('Message deleted');
  });

  it('collapses whitespace so a multi-line message fits one line', () => {
    expect(excerpt({ kind: 'text', body: 'line one\n\n  line two' })).toBe('line one line two');
  });

  it('truncates with an ellipsis past 70 characters', () => {
    const result = excerpt({ kind: 'text', body: 'x'.repeat(200) });
    expect(result).toHaveLength(70);
    expect(result.endsWith('…')).toBe(true);
  });

  it('leaves a message at the boundary alone', () => {
    const exact = 'x'.repeat(70);
    expect(excerpt({ kind: 'text', body: exact })).toBe(exact);
  });
});

describe('channelLabel', () => {
  const base: ChannelSummary = {
    id: 'c1',
    kind: 'league',
    name: 'general',
    topic: null,
    emoji: null,
    mode: null,
    leagueId: 'l1',
    isDefault: true,
    lastMessageAt: null,
    unread: 0,
    partner: null,
  };

  it('uses the channel name for a room', () => {
    expect(channelLabel(base)).toBe('general');
  });

  it('uses the other person for a direct message', () => {
    expect(
      channelLabel({
        ...base,
        kind: 'dm',
        name: 'Direct message',
        partner: { userId: 'u2', username: 'dave' },
      }),
    ).toBe('dave');
  });

  it('falls back when the other person is gone', () => {
    expect(channelLabel({ ...base, kind: 'dm', partner: null })).toBe('Direct message');
  });
});

describe('QUICK_REACTIONS', () => {
  it('is a small fixed set, so the API can validate against it', () => {
    expect(QUICK_REACTIONS.length).toBeLessThanOrEqual(6);
    expect(new Set(QUICK_REACTIONS).size).toBe(QUICK_REACTIONS.length);
  });
});
