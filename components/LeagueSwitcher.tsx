'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { LEAGUE_COOKIE } from '@/lib/league-cookie';

export interface SwitchableLeague {
  id: string;
  name: string;
}

/**
 * League picker.
 *
 * A native <select> on purpose: iOS renders it as a wheel the thumb already
 * knows how to use, it handles long league names without a custom popover, and
 * it is accessible for nothing. The styled box is a presentational overlay
 * behind a transparent, full-size control.
 *
 * Switching writes the choice to a cookie as well as navigating, so it is still
 * in force on the next screen and on the next cold start. Without that the
 * selection lived only in the query string and was dropped by the first link
 * that did not carry it.
 */
export default function LeagueSwitcher({
  leagues,
  currentId,
}: {
  leagues: readonly SwitchableLeague[];
  currentId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (leagues.length < 2) return null;

  const current = leagues.find((l) => l.id === currentId) ?? leagues[0]!;

  const change = (id: string) => {
    // A year, because this is a preference and not a session. SameSite=Lax so
    // it travels with the navigation that follows; no sensitive value is in it.
    document.cookie = `${LEAGUE_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;

    // Drop ?league= rather than rewriting it. The cookie is now the source of
    // truth, and leaving the parameter behind would pin this screen to one
    // league while the rest of the app moved on.
    const params = new URLSearchParams(searchParams.toString());
    params.delete('league');
    const query = params.toString();

    router.push(query ? `${pathname}?${query}` : pathname);
    router.refresh();
  };

  return (
    <div className="relative shrink-0">
      <div className="flex h-9 items-center gap-1.5 rounded-xl border border-line bg-raised pl-3 pr-2 text-xs font-bold">
        <span className="max-w-[108px] truncate">{current.name}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <select
        aria-label="Switch league"
        value={current.id}
        onChange={(event) => change(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {leagues.map((league) => (
          <option key={league.id} value={league.id}>
            {league.name}
          </option>
        ))}
      </select>
    </div>
  );
}
