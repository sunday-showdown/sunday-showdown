'use client';

import { useRouter } from 'next/navigation';
import { LEAGUE_COOKIE } from '@/lib/league-cookie';
import { formatCountdown } from '@/lib/format';
import LeagueBadge from './LeagueBadge';
import type { LeagueCard } from '@/lib/dashboard';

/**
 * Every league you are in, on the screen the app opens to.
 *
 * Tapping one makes it the active league and takes you to its card, rather than
 * just linking somewhere with a query string — so the rest of the app follows
 * you there and stays there. That is the whole point of the row: before this,
 * a second league was unreachable from home and the app looked stuck on the
 * first one.
 */
export default function LeagueCards({
  cards,
  activeId,
}: {
  cards: readonly LeagueCard[];
  activeId: string | null;
}) {
  const router = useRouter();

  const open = (leagueId: string) => {
    document.cookie = `${LEAGUE_COOKIE}=${encodeURIComponent(leagueId)}; path=/; max-age=31536000; samesite=lax`;
    router.push('/picks');
    router.refresh();
  };

  return (
    <div className="space-y-2 px-4">
      {cards.map((card) => {
        const active = card.league.id === activeId;
        const complete = card.slate > 0 && card.picked >= card.slate;
        const locked = card.lockTime !== null && new Date(card.lockTime).getTime() <= Date.now();

        return (
          <button
            key={card.league.id}
            type="button"
            onClick={() => open(card.league.id)}
            aria-current={active ? 'true' : undefined}
            className={`card w-full px-4 py-3 text-left active:bg-raised ${
              active ? 'border-brand/50' : ''
            }`}
          >
            <div className="flex items-center gap-2.5">
              <LeagueBadge name={card.league.name} url={card.league.avatar_url} size={32} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-bold">
                {card.league.name}
              </span>

              {active && <span className="chip bg-brand/15 text-brand">Active</span>}
              {card.unread > 0 && (
                <span className="display flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] text-brand-ink tabnum">
                  {card.unread > 99 ? '99+' : card.unread}
                </span>
              )}
            </div>

            <div className="mt-2 flex items-end gap-4">
              <Figure
                label={`Week ${card.league.current_week}`}
                value={card.slate > 0 ? `${card.picked}/${card.slate}` : '—'}
                tone={complete ? 'text-win' : locked && card.picked === 0 ? 'text-loss' : 'text-ink'}
              />

              <Figure
                label="Rank"
                value={card.rank === null ? '—' : `${card.rank}`}
                suffix={card.rank !== null && card.fieldSize > 0 ? `/${card.fieldSize}` : undefined}
                tone={card.rank === 1 ? 'text-gold' : 'text-ink'}
              />

              <Figure label="Points" value={String(Math.round(card.points))} />

              <span className="ml-auto pb-0.5 text-right">
                {card.lockTime && !locked ? (
                  <>
                    <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-muted">
                      Locks in
                    </span>
                    <span className="display text-[15px] leading-none tabnum text-brand">
                      {formatCountdown(new Date(card.lockTime).getTime() - Date.now())}
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] font-bold text-muted">
                    {locked ? 'Locked' : 'Not open'}
                  </span>
                )}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Figure({
  label,
  value,
  suffix,
  tone = 'text-ink',
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: string;
}) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={`display text-[18px] leading-none tabnum ${tone}`}>
        {value}
        {suffix && <span className="text-[11px] text-muted">{suffix}</span>}
      </div>
    </div>
  );
}
