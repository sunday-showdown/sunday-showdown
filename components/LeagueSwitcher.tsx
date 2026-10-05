'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

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
    const params = new URLSearchParams(searchParams.toString());
    params.set('league', id);
    router.push(`${pathname}?${params.toString()}`);
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
