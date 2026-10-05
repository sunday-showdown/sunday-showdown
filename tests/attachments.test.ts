import { describe, it, expect, beforeAll } from 'vitest';
import { isAllowedAttachmentUrl } from '../lib/attachments';

// The whole point of the allowlist is what it REFUSES. An attachment url comes
// from the browser and ends up in an <img> every member of a league loads, so
// an arbitrary host there means somebody can make a league fetch an address of
// their choosing.
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefg.supabase.co';
});

describe('isAllowedAttachmentUrl', () => {
  it('allows a public object in the project bucket', () => {
    expect(
      isAllowedAttachmentUrl(
        'https://abcdefg.supabase.co/storage/v1/object/public/chat-media/u1/abc.png',
      ),
    ).toBe(true);
  });

  it('allows Tenor media', () => {
    expect(isAllowedAttachmentUrl('https://media.tenor.com/abc/sack.gif')).toBe(true);
    expect(isAllowedAttachmentUrl('https://media1.tenor.com/abc/sack.gif')).toBe(true);
  });

  it('refuses any other host', () => {
    expect(isAllowedAttachmentUrl('https://example.com/tracker.png')).toBe(false);
    expect(isAllowedAttachmentUrl('https://evil.test/1x1.gif')).toBe(false);
  });

  it('refuses a host that merely ends with the allowed one', () => {
    expect(isAllowedAttachmentUrl('https://nottenor.com/a.gif')).toBe(false);
    expect(isAllowedAttachmentUrl('https://media.tenor.com.evil.test/a.gif')).toBe(false);
    expect(isAllowedAttachmentUrl('https://abcdefg.supabase.co.evil.test/a.png')).toBe(false);
  });

  it('refuses another Supabase project', () => {
    expect(
      isAllowedAttachmentUrl(
        'https://someoneelse.supabase.co/storage/v1/object/public/chat-media/x.png',
      ),
    ).toBe(false);
  });

  it('refuses a non-public path in our own bucket', () => {
    // A signed or authenticated path would expire and render as a broken image.
    expect(
      isAllowedAttachmentUrl('https://abcdefg.supabase.co/storage/v1/object/sign/chat-media/x.png'),
    ).toBe(false);
  });

  it('refuses anything that is not https', () => {
    expect(isAllowedAttachmentUrl('http://media.tenor.com/a.gif')).toBe(false);
    expect(isAllowedAttachmentUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedAttachmentUrl('data:image/gif;base64,R0lGODlhAQABAAAAACw=')).toBe(false);
  });

  it('refuses a value that is not a url at all', () => {
    for (const input of [null, undefined, 42, '', 'not a url', {}]) {
      expect(isAllowedAttachmentUrl(input)).toBe(false);
    }
  });

  it('refuses an absurdly long url', () => {
    expect(isAllowedAttachmentUrl(`https://media.tenor.com/${'a'.repeat(2100)}.gif`)).toBe(false);
  });
});
