'use client';

import { useRouter } from 'next/navigation';
import { LEAGUE_COOKIE } from '@/lib/league-cookie';

/**
 * Global, or one of your leagues.
 *
 * A row of pills rather than a dropdown: with one or two leagues the whole
 * choice fits on screen, and the point of the control is to make it obvious
 * that a global board exists at all.
 *
 * Picking a league also makes it the active one, the way the league cards on
 * Home do — otherwise looking at a league's table here and then tapping through
 * to Picks would take you somewhere else.
 */
export default function RankScope({
  leagues,
  scope,
}: {
  leagues: readonly { id: string; name: string }[];
  /** A league id, or 'global'. */
  scope: string;
}) {
  const router = useRouter();

  const go = (next: string) => {
    if (next !== 'global') {
      document.cookie = `${LEAGUE_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=31536000; samesite=lax`;
    }
    router.push(next === 'global' ? '/ranks?scope=global' : `/ranks?league=${next}`);
    router.refresh();
  };

  const options = [{ id: 'global', name: 'Everyone' }, ...leagues];

  return (
    <div className="no-scrollbar -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4">
      {options.map((option) => {
        const active = option.id === scope;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => go(option.id)}
            aria-pressed={active}
            className={`h-9 shrink-0 rounded-xl px-3.5 text-[13px] font-bold leading-none transition-colors ${
              active ? 'bg-ink text-bg' : 'bg-raised text-muted'
            }`}
          >
            {option.name}
          </button>
        );
      })}
    </div>
  );
}
