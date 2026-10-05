// GIF search, proxied through Tenor.
//
// Tenor needs a key, and a key cannot go in the client without handing it out,
// so the search runs here. Set TENOR_API_KEY to switch it on; a free key comes
// from Google Cloud with the Tenor API enabled.
//
// Without a key the endpoint reports `configured: false` rather than failing,
// and the picker says so and falls back to uploading a GIF file — which works
// with no key at all. The feature degrades instead of breaking.

import { getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ENDPOINT = 'https://tenor.googleapis.com/v2';
const LIMIT = 24;

export interface GifResult {
  id: string;
  url: string;
  preview: string;
  width: number | null;
  height: number | null;
  description: string;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const key = process.env.TENOR_API_KEY;
  if (!key) return Response.json({ configured: false, results: [] });

  const query = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 80);

  const params = new URLSearchParams({
    key,
    limit: String(LIMIT),
    // tinygif for the grid, gif for what actually gets sent.
    media_filter: 'tinygif,gif',
    // This is a group chat, not an open feed; keep the search family-safe.
    contentfilter: 'high',
    client_key: 'sunday_showdown',
  });
  if (query) params.set('q', query);

  // No query means the trending shelf, which is what a picker should open on.
  const path = query ? 'search' : 'featured';

  try {
    const response = await fetch(`${ENDPOINT}/${path}?${params.toString()}`, {
      // Trending changes slowly; a search for the same term twice in a session
      // should not be two round trips.
      next: { revalidate: 600 },
    });

    if (!response.ok) {
      return Response.json({ configured: true, results: [], error: 'Tenor is not answering.' });
    }

    const payload = (await response.json()) as { results?: unknown };
    return Response.json({ configured: true, results: parseResults(payload.results) });
  } catch {
    return Response.json({ configured: true, results: [], error: 'Tenor is not answering.' });
  }
}

function parseResults(value: unknown): GifResult[] {
  if (!Array.isArray(value)) return [];

  const results: GifResult[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const formats = item.media_formats as Record<string, unknown> | undefined;
    if (!formats) continue;

    const full = formats.gif as { url?: unknown; dims?: unknown } | undefined;
    const small = formats.tinygif as { url?: unknown } | undefined;
    if (typeof full?.url !== 'string') continue;

    const dims = Array.isArray(full.dims) ? full.dims : [];
    results.push({
      id: typeof item.id === 'string' ? item.id : full.url,
      url: full.url,
      preview: typeof small?.url === 'string' ? small.url : full.url,
      width: typeof dims[0] === 'number' ? dims[0] : null,
      height: typeof dims[1] === 'number' ? dims[1] : null,
      description: typeof item.content_description === 'string' ? item.content_description : 'GIF',
    });
  }
  return results;
}
