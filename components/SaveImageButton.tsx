'use client';

import { useState } from 'react';

/**
 * Get an image onto the phone.
 *
 * Two routes, because iOS and everything else want different things. If the
 * browser can share files, that opens the system sheet whose first option on
 * an iPhone is "Save Image" — the gesture people already know, and the only one
 * that reaches the photo roll from a web app. Everywhere else it is a download.
 *
 * The last resort opens the image in a tab, which matters for a GIF served from
 * Tenor: a cross-origin fetch needs CORS headers nobody has promised us, and a
 * tab where long-press works beats an error.
 */
export function useSaveImage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (blob: Blob, filename: string, fallbackUrl?: string) => {
    setBusy(true);
    setError('');

    try {
      const file = new File([blob], filename, { type: blob.type || 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          return;
        } catch (shareError) {
          // Dismissing the sheet rejects, and that is not a failure.
          if ((shareError as DOMException)?.name === 'AbortError') return;
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked on the next tick so Safari has taken the blob first.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (fallbackUrl) {
        window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
        setError('Opened in a new tab — press and hold to save it.');
      } else {
        setError('Could not save that image.');
      }
    } finally {
      setBusy(false);
    }
  };

  /** Fetch a remote image first, then save it. */
  const saveFromUrl = async (url: string, filename: string) => {
    setBusy(true);
    setError('');

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('fetch failed');
      await save(await response.blob(), filename, url);
    } catch {
      // Almost always a cross-origin image without CORS headers.
      window.open(url, '_blank', 'noopener,noreferrer');
      setError('Opened in a new tab — press and hold to save it.');
      setBusy(false);
    }
  };

  return { save, saveFromUrl, busy, error };
}

/** A small round save control, for the corner of an image in chat. */
export default function SaveImageButton({ url, filename }: { url: string; filename: string }) {
  const { saveFromUrl, busy } = useSaveImage();

  return (
    <button
      type="button"
      onClick={(event) => {
        // The bubble underneath opens the actions row on tap.
        event.stopPropagation();
        void saveFromUrl(url, filename);
      }}
      disabled={busy}
      aria-label="Save this image"
      className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm active:bg-black/75 disabled:opacity-60"
    >
      {busy ? (
        <span className="text-[10px] font-bold">…</span>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 4v11m0 0 4-4m-4 4-4-4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M5 18.5h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
