'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatKickoff } from '@/lib/format';
import type { LiveStandingState } from '@/lib/live';

export interface LiveRow {
  gameId: string;
  awayAbbr: string;
  homeAbbr: string;
  awayLogo: string | null;
  homeLogo: string | null;
  awayScore: number | null;
  homeScore: number | null;
  status: string;
  statusDetail: string | null;
  kickoff: string;
  pickLabel: string | null;
  state: LiveStandingState;
  value: number;
}

export interface LiveTotals {
  banked: number;
  inPlay: number;
  atRisk: number;
  live: number;
  waiting: number;
}

const STATE_STYLE: Record<LiveStandingState, { label: string; className: string }> = {
  winning: { label: 'On track', className: 'bg-win/15 text-win' },
  losing: { label: 'Behind', className: 'bg-loss/15 text-loss' },
  tied: { label: 'On the number', className: 'bg-push/20 text-push' },
  settled: { label: 'Final', className: 'bg-raised text-muted' },
  waiting: { label: 'Not started', className: 'bg-raised text-muted' },
};

export default function LiveCard({
  rows,
  totals,
  anyLive,
}: {
  rows: readonly LiveRow[];
  totals: LiveTotals;
  anyLive: boolean;
}) {
  const router = useRouter();

  // Poll only while something is actually in progress. Refreshing a page of
  // finished games is pure waste, and the sync itself only runs every 10
  // minutes so anything faster would show the same numbers.
  useEffect(() => {
    if (!anyLive) return;
    const id = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(id);
  }, [anyLive, router]);

  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 1200);
  };

  return (
    <>
      <div className="px-4">
        <div className="card grid grid-cols-3 divide-x divide-line">
          <Total label="Banked" value={totals.banked} tone="text-ink" />
          <Total label="On track" value={totals.inPlay} tone="text-win" />
          <Total label="At risk" value={totals.atRisk} tone="text-loss" />
        </div>
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted">
          Banked is settled. On track is what you&apos;d bank if every live game
          ended now — nothing is yours until the final whistle.
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between px-4">
        <h2 className="eyebrow">
          Your card
        </h2>
        <button type="button" onClick={refresh} className="btn-ghost h-8 px-3 text-xs">
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="mt-2 space-y-2 px-4">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            No picks this week yet.
          </p>
        ) : (
          rows.map((row) => {
            const style = STATE_STYLE[row.state];
            const live = row.status === 'in_progress';

            return (
              <article key={row.gameId} className="card px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Team abbr={row.awayAbbr} logo={row.awayLogo} />
                    <span className="text-muted">@</span>
                    <Team abbr={row.homeAbbr} logo={row.homeLogo} />
                  </span>

                  <span className="flex items-center gap-2">
                    {live && <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-live" />}
                    <span className="display text-[17px] leading-none tabnum">
                      {row.status === 'scheduled'
                        ? formatKickoff(row.kickoff)
                        : `${row.awayScore ?? 0}–${row.homeScore ?? 0}`}
                    </span>
                  </span>
                </div>

                {row.pickLabel && (
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-line/70 pt-2">
                    <span className="truncate text-sm">{row.pickLabel}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${style.className}`}>
                        {style.label}
                      </span>
                      <span
                        className={`display text-[15px] leading-none tabnum ${
                          row.value > 0 ? 'text-brand' : 'text-muted'
                        }`}
                      >
                        +{row.value}
                      </span>
                    </span>
                  </div>
                )}

                {!row.pickLabel && (
                  <div className="mt-2 border-t border-line/70 pt-2 text-[11px] text-muted">
                    No pick on this game
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </>
  );
}

function Total({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="px-2 py-3 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={`display mt-0.5 text-[22px] leading-none tabnum ${tone}`}>{value}</div>
    </div>
  );
}

function Team({ abbr, logo }: { abbr: string; logo: string | null }) {
  return (
    <span className="flex items-center gap-1.5">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- ESPN CDN, already sized.
        <img src={logo} alt="" width={20} height={20} className="h-5 w-5 object-contain" />
      ) : null}
      {abbr}
    </span>
  );
}
