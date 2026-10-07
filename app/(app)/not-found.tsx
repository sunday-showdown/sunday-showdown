import Link from 'next/link';

/**
 * A screen that is not there.
 *
 * notFound() was already being called — the matchup page calls it for a duel
 * somebody is not party to — with nothing in this group to catch it, so it fell
 * through to the framework default outside the app's chrome.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
      <div className="display text-[26px] leading-tight">Not here</div>
      <p className="mt-2 max-w-[20rem] text-[14px] leading-relaxed text-muted">
        This might have been deleted, or it might never have been yours to see.
      </p>
      <Link href="/home" className="btn-ghost mt-6 w-full max-w-xs text-sm">
        Back to home
      </Link>
    </main>
  );
}
