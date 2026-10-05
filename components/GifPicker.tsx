'use client';

import { useEffect, useRef, useState } from 'react';
import Sheet from './Sheet';

export interface PickedGif {
  url: string;
  width: number | null;
  height: number | null;
  description: string;
}

/**
 * GIF search.
 *
 * Tenor is the source, proxied through /api/gifs so the key stays on the
 * server. Without a key configured the sheet says so plainly and points at the
 * attach button instead, which uploads a GIF file and needs no key — the
 * feature is reduced, not broken.
 */
export default function GifPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (gif: PickedGif) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickedGif[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(0);

  useEffect(() => {
    if (!open) return;

    // Debounced, and tagged with a sequence number: typing fast fires several
    // searches and the slowest must not be the one that renders.
    const token = ++latest.current;
    const timer = setTimeout(
      () => {
        setLoading(true);
        setError('');
        fetch(`/api/gifs?q=${encodeURIComponent(query)}`)
          .then((response) => response.json())
          .then((payload: { configured?: boolean; results?: PickedGif[]; error?: string }) => {
            if (token !== latest.current) return;
            setConfigured(payload.configured !== false);
            setResults(payload.results ?? []);
            if (payload.error) setError(payload.error);
          })
          .catch(() => {
            if (token === latest.current) setError('Could not reach the GIF search.');
          })
          .finally(() => {
            if (token === latest.current) setLoading(false);
          });
      },
      query ? 280 : 0,
    );

    return () => clearTimeout(timer);
  }, [open, query]);

  return (
    <Sheet open={open} onClose={onClose} title="Send a GIF">
      {configured && (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Tenor…"
          aria-label="Search GIFs"
          className="field mb-3"
        />
      )}

      {!configured && (
        <div className="card mb-3 px-4 py-3.5">
          <div className="text-[14px] font-bold">GIF search is switched off</div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            It needs a free Tenor API key in <code className="text-ink">TENOR_API_KEY</code>. Until
            then, you can still send a GIF by saving it and using the attach button — that works
            with no key at all.
          </p>
        </div>
      )}

      {error && <p className="mb-3 rounded-xl bg-loss/15 px-4 py-3 text-[12px] text-loss">{error}</p>}

      {loading && results.length === 0 && (
        <div className="grid grid-cols-2 gap-2 pb-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-raised" />
          ))}
        </div>
      )}

      {!loading && configured && results.length === 0 && !error && (
        <p className="py-8 text-center text-[13px] text-muted">
          {query ? `Nothing for “${query}”.` : 'No trending GIFs right now.'}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 pb-3">
        {results.map((gif) => (
          <button
            key={gif.url}
            type="button"
            onClick={() => {
              onPick(gif);
              onClose();
            }}
            className="overflow-hidden rounded-xl border border-line bg-raised active:scale-[0.97]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Tenor's CDN
                is the only remote host here and next/image would proxy every
                frame of every GIF through the server. */}
            <img
              src={gif.url}
              alt={gif.description}
              loading="lazy"
              className="h-28 w-full object-cover"
            />
          </button>
        ))}
      </div>

      {configured && results.length > 0 && (
        <p className="pb-2 text-center text-[10px] text-muted">Powered by Tenor</p>
      )}
    </Sheet>
  );
}
