'use client';

import { useState } from 'react';
import BetSlipComposer from './BetSlipComposer';
import { summarise, byBook, byKind, formatUnits, formatRate, type TrackedBet } from '@/lib/betStats';
import { findBook, bookName } from '@/lib/sportsbooks';
import { formatOdds, RESULT_LABEL } from '@/lib/format';
import { formatMoney } from '@/lib/bets';

/**
 * Your betting record.
 *
 * The honest framing matters here: nothing is synced. No US sportsbook offers
 * an API that lets an app read somebody's wagers, so every bet on this screen
 * is one the person entered. What the app can do is make the entry quick and
 * then do the arithmetic nobody does by hand — units and ROI rather than a
 * count of wins, because "up $400" means nothing without knowing the bet size.
 */
export default function BetTracker({
  bets,
  unitSize,
  onChanged,
  preferredBooks,
}: {
  bets: readonly TrackedBet[];
  unitSize: number;
  onChanged: () => void;
  preferredBooks?: readonly string[];
}) {
  const [logging, setLogging] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'settled'>('all');
  const [unit, setUnit] = useState(String(unitSize));
  const [savingUnit, setSavingUnit] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const record = summarise(bets, unitSize);
  const books = byBook(bets, unitSize);
  const { singles, parlays } = byKind(bets, unitSize);

  const shown = bets.filter((bet) =>
    filter === 'open' ? bet.result === 'pending' : filter === 'settled' ? bet.result !== 'pending' : true,
  );

  const saveUnit = async () => {
    const value = Number(unit);
    if (!Number.isFinite(value) || value <= 0) return;

    setSavingUnit(true);
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitSize: value }),
      });
      onChanged();
    } finally {
      setSavingUnit(false);
    }
  };

  const settle = async (betId: string, result: string) => {
    setBusy(betId);
    try {
      await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'settle', betId, result }),
      });
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="pb-6">
      <section className="px-4">
        <div className="card overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
            <Headline
              label="Units won"
              value={formatUnits(record.unitsWon)}
              tone={record.unitsWon > 0 ? 'text-win' : record.unitsWon < 0 ? 'text-loss' : 'text-ink'}
            />
            <Headline
              label="ROI"
              value={record.roi === null ? '—' : `${(record.roi * 100).toFixed(1)}%`}
              tone={
                record.roi === null
                  ? 'text-muted'
                  : record.roi > 0
                    ? 'text-win'
                    : record.roi < 0
                      ? 'text-loss'
                      : 'text-ink'
              }
            />
          </div>

          <div className="grid grid-cols-3 divide-x divide-line">
            <Figure
              label="Record"
              value={
                record.pushes > 0
                  ? `${record.wins}-${record.losses}-${record.pushes}`
                  : `${record.wins}-${record.losses}`
              }
            />
            <Figure label="Win rate" value={formatRate(record.winRate)} />
            <Figure
              label="Streak"
              value={record.streak.kind === null ? '—' : `${record.streak.length}${record.streak.kind === 'win' ? 'W' : 'L'}`}
              tone={record.streak.kind === 'win' ? 'text-win' : record.streak.kind === 'loss' ? 'text-loss' : 'text-ink'}
            />
          </div>
        </div>
      </section>

      <section className="mt-2 px-4">
        <button type="button" onClick={() => setLogging(true)} className="btn-primary w-full text-sm">
          Log a bet
        </button>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Entered by hand, because no sportsbook lets an app read your wagers.
          One unit is{' '}
          <span className="inline-flex items-baseline gap-1">
            $
            <input
              inputMode="decimal"
              value={unit}
              onChange={(event) => setUnit(event.target.value.replace(/[^0-9.]/g, ''))}
              onBlur={saveUnit}
              aria-label="Your unit size"
              className="w-12 border-b border-line bg-transparent text-center text-ink tabnum focus:border-brand focus:outline-none"
            />
          </span>
          {savingUnit ? ' saving…' : ' — change it and every figure above rescales.'}
        </p>
      </section>

      {(singles.settled > 0 || parlays.settled > 0) && (
        <section className="mt-5 px-4">
          <h2 className="eyebrow pb-2">Where it comes from</h2>
          <div className="grid grid-cols-2 gap-2">
            <Split title="Singles" record={singles} />
            <Split title="Parlays" record={parlays} />
          </div>
        </section>
      )}

      {books.length > 1 && (
        <section className="mt-5 px-4">
          <h2 className="eyebrow pb-2">By book</h2>
          <div className="card divide-y divide-line/60">
            {books.map((entry) => (
              <div key={entry.book} className="flex items-center gap-3 px-3.5 py-2.5">
                <span
                  className="display flex h-6 shrink-0 items-center rounded-md px-1.5 text-[10px] text-brand-ink"
                  style={{ background: findBook(entry.book)?.accent ?? '#8d8d8d' }}
                >
                  {findBook(entry.book)?.short ?? '•'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold">
                  {bookName(entry.book)}
                </span>
                <span className="shrink-0 text-[11px] tabnum text-muted">
                  {entry.wins}-{entry.losses}
                </span>
                <span
                  className={`display w-14 shrink-0 text-right text-[15px] leading-none tabnum ${
                    entry.unitsWon > 0 ? 'text-win' : entry.unitsWon < 0 ? 'text-loss' : 'text-muted'
                  }`}
                >
                  {formatUnits(entry.unitsWon)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-5 px-4">
        <div className="flex items-center justify-between pb-2">
          <h2 className="eyebrow">Your bets</h2>
          <div className="flex gap-1">
            {(['all', 'open', 'settled'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`h-7 rounded-lg px-2.5 text-[11px] font-bold capitalize transition-colors ${
                  filter === value ? 'bg-brand text-brand-ink' : 'bg-raised text-muted'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="card px-6 py-10 text-center">
            <h3 className="display text-[18px] leading-none">
              {bets.length === 0 ? 'Nothing logged yet' : 'Nothing here'}
            </h3>
            <p className="mx-auto mt-2 max-w-xs text-[12.5px] leading-relaxed text-muted">
              {bets.length === 0
                ? 'Log what you place and this fills in with your real record — units, ROI and which book you actually beat.'
                : 'Try another filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {shown.map((bet) => (
              <div key={bet.id} className="card px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className="display flex h-5 shrink-0 items-center rounded px-1.5 text-[9px] text-brand-ink"
                    style={{ background: findBook(bet.book)?.accent ?? '#8d8d8d' }}
                  >
                    {findBook(bet.book)?.short ?? '•'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                    {bet.legs > 1 ? `${bet.legs}-leg parlay` : 'Single'}
                  </span>
                  <span className="shrink-0 text-[12px] font-bold tabnum text-brand">
                    {formatOdds(bet.americanOdds)}
                  </span>
                  {bet.stake !== null && (
                    <span className="shrink-0 text-[11px] tabnum text-muted">
                      {formatMoney(bet.stake)}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  {(['win', 'push', 'loss'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      disabled={busy === bet.id}
                      onClick={() => settle(bet.id, bet.result === option ? 'pending' : option)}
                      aria-pressed={bet.result === option}
                      className={`h-7 flex-1 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-60 ${
                        bet.result === option
                          ? option === 'win'
                            ? 'bg-win/20 text-win'
                            : option === 'loss'
                              ? 'bg-loss/25 text-loss'
                              : 'bg-push/25 text-push'
                          : 'bg-raised text-muted'
                      }`}
                    >
                      {RESULT_LABEL[option]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <BetSlipComposer
        preferredBooks={preferredBooks}
        open={logging}
        onClose={() => setLogging(false)}
        channelId={null}
        leagueId={null}
        onShared={onChanged}
      />
    </div>
  );
}

function Headline({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="px-4 py-3.5 text-center">
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className={`display mt-1 text-[30px] leading-none tabnum ${tone}`}>{value}</div>
    </div>
  );
}

function Figure({ label, value, tone = 'text-ink' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-2 py-2.5 text-center">
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={`display mt-0.5 text-[16px] leading-none tabnum ${tone}`}>{value}</div>
    </div>
  );
}

function Split({ title, record }: { title: string; record: ReturnType<typeof summarise> }) {
  return (
    <div className="card px-3.5 py-3">
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">{title}</div>
      <div
        className={`display mt-1 text-[22px] leading-none tabnum ${
          record.unitsWon > 0 ? 'text-win' : record.unitsWon < 0 ? 'text-loss' : 'text-ink'
        }`}
      >
        {formatUnits(record.unitsWon)}
      </div>
      <div className="mt-1 text-[11px] tabnum text-muted">
        {record.wins}-{record.losses}
        {record.pushes > 0 ? `-${record.pushes}` : ''} · {formatRate(record.winRate)}
      </div>
    </div>
  );
}
