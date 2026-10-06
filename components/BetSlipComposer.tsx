'use client';

import { useMemo, useState } from 'react';
import Sheet from './Sheet';
import { SPORTSBOOKS } from '@/lib/sportsbooks';
import { parlayOdds, toWin, formatMoney, MAX_LEGS, type BetLeg } from '@/lib/bets';
import { formatOdds } from '@/lib/format';

interface DraftLeg {
  description: string;
  odds: string;
}

/**
 * Build a slip to share.
 *
 * Legs are typed in free text rather than picked from a list of games, and that
 * is deliberate. People bet player props, alt lines, same-game parlays and
 * things this app has no feed for; a structured picker would cover a third of
 * what somebody actually has on their phone and quietly exclude the rest.
 *
 * The one thing that is computed is the parlay price, which multiplies the way
 * a book does — so the number here matches the number on their slip, and the
 * total can still be overridden when a book's boost makes it differ.
 */
export default function BetSlipComposer({
  open,
  onClose,
  channelId,
  leagueId,
  onShared,
}: {
  open: boolean;
  onClose: () => void;
  /** Null logs the bet to your own record without posting it anywhere. */
  channelId: string | null;
  leagueId: string | null;
  onShared: () => void;
}) {
  const [book, setBook] = useState<string>(SPORTSBOOKS[0]!.id);
  const [legs, setLegs] = useState<DraftLeg[]>([{ description: '', odds: '' }]);
  const [stake, setStake] = useState('');
  const [note, setNote] = useState('');
  const [override, setOverride] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const parsedLegs = useMemo<BetLeg[]>(
    () =>
      legs
        .filter((leg) => leg.description.trim())
        .map((leg) => {
          const parsed = Number(leg.odds);
          return {
            description: leg.description.trim(),
            americanOdds: leg.odds.trim() && Number.isFinite(parsed) ? Math.round(parsed) : null,
          };
        }),
    [legs],
  );

  const computed = parlayOdds(parsedLegs);
  const overrideValue = override.trim() ? Math.round(Number(override)) : null;
  const price =
    overrideValue !== null && Number.isFinite(overrideValue) && Math.abs(overrideValue) >= 100
      ? overrideValue
      : computed;

  const stakeValue = stake.trim() ? Number(stake) : null;
  const profit = price !== null ? toWin(stakeValue, price) : null;

  const setLeg = (index: number, patch: Partial<DraftLeg>) => {
    setLegs((current) => current.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)));
  };

  const share = async () => {
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'share',
          channelId,
          leagueId,
          slip: {
            book,
            legs: parsedLegs,
            americanOdds: price,
            stake: stakeValue,
            note: note.trim() || null,
          },
        }),
      });

      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error ?? 'That did not post.');
        return;
      }

      setLegs([{ description: '', odds: '' }]);
      setStake('');
      setNote('');
      setOverride('');
      onShared();
      onClose();
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const ready = parsedLegs.length > 0 && price !== null && !busy;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={channelId ? 'Share a bet' : 'Log a bet'}
      footer={
        <>
          {error && (
            <p role="alert" className="mb-2 rounded-xl bg-loss/15 px-3 py-2 text-[12px] text-loss">
              {error}
            </p>
          )}
          <button type="button" disabled={!ready} onClick={share} className="btn-primary w-full text-sm">
            {busy
              ? 'Saving…'
              : price === null
                ? 'Add the odds'
                : channelId
                  ? `Post slip at ${formatOdds(price)}`
                  : `Log it at ${formatOdds(price)}`}
          </button>
        </>
      }
    >
      <label className="eyebrow pb-2">Sportsbook</label>
      <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {SPORTSBOOKS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setBook(option.id)}
            aria-pressed={book === option.id}
            className={`shrink-0 rounded-xl border px-3 py-2 text-[12px] font-bold transition-colors ${
              book === option.id
                ? 'border-transparent text-brand-ink'
                : 'border-line bg-raised text-muted'
            }`}
            style={book === option.id ? { background: option.accent } : undefined}
          >
            {option.name}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between pb-2">
        <span className="eyebrow">{legs.length > 1 ? `${legs.length} legs` : 'The bet'}</span>
        {legs.length > 1 && computed !== null && (
          <span className="text-[11px] font-bold text-muted">
            Parlay price {formatOdds(computed)}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {legs.map((leg, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              value={leg.description}
              onChange={(event) => setLeg(index, { description: event.target.value })}
              placeholder={index === 0 ? 'Chiefs -3.5' : 'Another leg'}
              maxLength={120}
              aria-label={`Leg ${index + 1}`}
              className="field min-w-0 flex-1"
            />
            <input
              value={leg.odds}
              onChange={(event) =>
                setLeg(index, { odds: event.target.value.replace(/[^0-9+-]/g, '') })
              }
              inputMode="numeric"
              placeholder="-110"
              aria-label={`Leg ${index + 1} odds`}
              className="field w-[86px] shrink-0 text-center tabnum"
            />
            {legs.length > 1 && (
              <button
                type="button"
                onClick={() => setLegs((current) => current.filter((_, i) => i !== index))}
                aria-label={`Remove leg ${index + 1}`}
                className="tap shrink-0 text-muted active:text-ink"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {legs.length < MAX_LEGS && (
        <button
          type="button"
          onClick={() => setLegs((current) => [...current, { description: '', odds: '' }])}
          className="btn-ghost mt-2 w-full text-[13px]"
        >
          + Add a leg
        </button>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="stake" className="eyebrow pb-1.5">
            Stake
          </label>
          <input
            id="stake"
            value={stake}
            onChange={(event) => setStake(event.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder="25"
            className="field tabnum"
          />
        </div>
        <div>
          <label htmlFor="total-odds" className="eyebrow pb-1.5">
            Total odds
          </label>
          <input
            id="total-odds"
            value={override}
            onChange={(event) => setOverride(event.target.value.replace(/[^0-9+-]/g, ''))}
            inputMode="numeric"
            placeholder={computed !== null ? String(computed) : '+450'}
            className="field tabnum"
          />
        </div>
      </div>

      {stakeValue !== null && profit !== null && (
        <div className="card mt-3 flex items-center justify-between px-4 py-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
            To win
          </span>
          <span className="display text-[20px] leading-none tabnum text-win">
            {formatMoney(profit)}
          </span>
        </div>
      )}

      <label htmlFor="bet-note" className="eyebrow mt-4 pb-1.5">
        Say something
      </label>
      <input
        id="bet-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={280}
        placeholder="Lock of the year"
        className="field mb-3"
      />

      <p className="pb-2 text-[11px] leading-relaxed text-muted">
        {channelId
          ? 'Sharing only. Nothing here is placed for you, and a slip never changes your league points — it is for the tails and the receipts.'
          : 'Private to you, and counted in your record. No sportsbook lets an app read your actual wagers, so this is what you tell it.'}
      </p>
    </Sheet>
  );
}
