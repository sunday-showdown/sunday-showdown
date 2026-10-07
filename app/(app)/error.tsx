'use client';

import { useEffect } from 'react';

/**
 * When a screen throws.
 *
 * There was no error boundary anywhere, so anything a page threw — a database
 * hiccup, a bad week in a query string — reached Next's default error screen,
 * which is a stack trace in development and a bare "something went wrong" in
 * production, in neither case inside the app's own chrome.
 *
 * Scoped to the signed-in group, so the nav stays and the way out is a tap
 * rather than a back gesture.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle on a production stack trace, so it goes to
    // the console where a bug report can quote it.
    console.error('screen error', error.digest, error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
      <div className="display text-[26px] leading-tight">That did not load</div>
      <p className="mt-2 max-w-[20rem] text-[14px] leading-relaxed text-muted">
        Something went wrong fetching this screen. It is usually temporary.
      </p>

      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
        <button type="button" onClick={reset} className="btn-primary w-full text-[15px]">
          Try again
        </button>
        <a href="/home" className="btn-ghost w-full text-sm">
          Back to home
        </a>
      </div>

      {error.digest && (
        <p className="mt-4 text-[10px] tabnum text-muted">Reference {error.digest}</p>
      )}
    </main>
  );
}
