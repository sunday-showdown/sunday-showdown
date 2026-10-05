// Which hosts an attachment may point at.
//
// attachment_url arrives from the browser, and without this it would accept any
// URL at all. That matters more than it first looks: every message in a channel
// renders its attachment in an <img>, so an arbitrary URL turns the room into a
// way to make everyone in a league fetch a chosen address — which leaks their
// IP, and makes the app a convenient image proxy for whatever is on the other
// end.
//
// So two sources, both of which the app put there itself: the storage bucket,
// and Tenor's media CDN when a GIF was chosen through the picker.

/** The Supabase storage origin for this project, or null if unconfigured. */
function storageOrigin(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Tenor serves GIF media from media.tenor.com and numbered siblings. */
function isTenorMedia(hostname: string): boolean {
  return hostname === 'tenor.com' || hostname.endsWith('.tenor.com');
}

export function isAllowedAttachmentUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2000) return false;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;

  const origin = storageOrigin();
  if (origin && parsed.origin === origin && parsed.pathname.includes('/storage/v1/object/public/')) {
    return true;
  }

  return isTenorMedia(parsed.hostname);
}
