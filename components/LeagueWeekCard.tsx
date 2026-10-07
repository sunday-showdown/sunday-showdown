'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LEAGUE_COOKIE } from '@/lib/league-cookie';
import { formatCountdown } from '@/lib/format';
import LeagueBadge from './LeagueBadge';
import type { LeagueCard } from '@/lib/dashboard';

/**
 * One league's week, whole.
 *
 * Home used to show a big hero for whichever league was "active" and then a
 * separate, smaller row for every league including that one — so the active
 * league appeared twice and the others could only be reached by switching to
 * them. Somebody in two leagues was being asked to toggle the whole app back
 * and forth to answer "what do I still have to do", which is the one question
 * this screen exists for.
 *
 * So there is no active league here any more. Every league gets this card, they
 * stack, and the card carries everything the hero used to: the countdown, the
 * progress, the picks themselves and the way in.
 */
export default function LeagueWeekCard({ card }: { card: LeagueCard }) {
  const router = useRouter();

  const locked = card.lockTime !== null && new Date(card.lockTime).getTime() <= Date.now();
  const complete = card.slate > 0 && card.picked >= card.slate;
  const open = card.slate > 0 && !locked && !complete;

  // Tapping a league makes it the one the rest of the app is pointed at, so
  // Picks opens the card you just tapped rather than whichever was last chosen.
  const go = (href: string) => {
    document.cookie = `${LEAGUE_COOKIE}=${encodeURIComponent(card.league.id)}; path=/; max-age=31536000; samesite=lax`;
    router.push(href);
    router.refresh();
  };

  const headline = card.slate === 0
    ? 'Not open yet'
    : locked
      ? 'Locked'
      : complete
        ? 'Card complete'
        : card.picked === 0
          ? 'Nothing picked'
          : `${card.picked} of ${card.slate} in`;

  return (
    <div className={`card overflow-hidden px-4 py-3.5 ${open ? 'card-hot' : ''}`}>
      <button type="button" onClick={() => go('/picks')} className="flex w-full items-center gap-2.5 text-left">
        <LeagueBadge name={card.league.name} url={card.league.avatar_url} size={28} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{card.league.name}</span>

        {card.unread > 0 && (
          <span className="display flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] text-brand-ink tabnum">
            {card.unread > 99 ? '99+' : card.unread}
          </span>
        )}
        <span className="shrink-0 text-[11px] font-bold text-muted">
          Week {card.league.current_week}
        </span>
      </button>

      <div className="mt-2 flex items-end justify-between gap-3">
        {/* Smaller than the old hero. "Card complete" set at 34px was shouting
            a non-event — the interesting number is the countdown. */}
        <div className="display text-[22px] leading-none">{headline}</div>

        {card.lockTime && !locked && (
          <div className="shrink-0 text-right">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted">
              Locks in
            </div>
            <div className="display text-[20px] leading-none tabnum text-brand">
              {formatCountdown(new Date(card.lockTime).getTime() - Date.now())}
            </div>
          </div>
        )}
      </div>

      {card.picked > 0 && card.slate > 0 && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-500"
              style={{ width: `${Math.min(100, (card.picked / card.slate) * 100)}%` }}
            />
          </div>
          <span className="display text-[14px] leading-none tabnum text-brand">{card.atStake}</span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-muted">to win</span>
        </div>
      )}

      {card.picks.length > 0 && (
        <div className="no-scrollbar -mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4">
          {card.picks.map((pick) => (
            <div key={pick.gameId} className="shrink-0 rounded-xl bg-raised/80 px-2.5 py-1.5">
              <div className="text-[12px] font-bold leading-none">{pick.label}</div>
              {/* Every chip names its game. A card of totals used to read as a
                  column of "Over 43.5" with nothing to tie them to a matchup. */}
              <div className="mt-1 flex items-baseline gap-1.5 leading-none">
                <span className="text-[9px] font-semibold text-muted">{pick.matchup}</span>
                <span className="text-[9px] font-bold text-brand tabnum">+{pick.worth}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => go('/picks')}
          className={`${open ? 'btn-primary' : 'btn-ghost'} h-10 flex-1 text-[14px]`}
        >
          {card.slate === 0
            ? 'See the week'
            : locked
              ? 'Review card'
              : complete
                ? 'Change picks'
                : card.picked === 0
                  ? 'Make picks'
                  : 'Finish card'}
        </button>

        <Link
          href={`/ranks?league=${card.league.id}`}
          className="btn-ghost h-10 shrink-0 px-3 text-[12px]"
        >
          {card.rank === null ? 'Table' : `${card.rank}${card.fieldSize > 0 ? `/${card.fieldSize}` : ''}`}
        </Link>
      </div>
    </div>
  );
}
