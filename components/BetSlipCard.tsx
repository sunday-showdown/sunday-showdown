'use client';

import { useState } from 'react';
import { formatOdds, RESULT_LABEL } from '@/lib/format';
import { formatMoney, toWin } from '@/lib/bets';
import { findBook, bookUrl } from '@/lib/sportsbooks';
import type { SharedBetView, Stance } from '@/lib/chat';

/**
 * A bet somebody placed, shared into a channel.
 *
 * Tail and fade are the whole point. A slip you can only look at is a
 * screenshot; a slip the room can take a side on is a conversation, and the
 * count next to each button is the part people come back to check.
 *
 * Nothing here touches the league standings. Mixing real stakes into the
 * scoring would mean whoever bets most wins, so a slip's result is
 * self-reported and worth exactly bragging rights.
 */
export default function BetSlipCard({
  bet,
  isMine,
  onChanged,
}: {
  bet: SharedBetView;
  isMine: boolean;
  onChanged?: () => void;
}) {
  const [stance, setStance] = useState<Stance | null>(bet.myStance);
  const [tails, setTails] = useState(bet.tails);
  const [fades, setFades] = useState(bet.fades);
  const [result, setResult] = useState(bet.result);
  const [busy, setBusy] = useState(false);

  const book = findBook(bet.book);
  const href = bookUrl(bet.book);
  const profit = toWin(bet.stake, bet.americanOdds);
  const isParlay = bet.legs.length > 1;

  const take = async (next: Stance) => {
    const clearing = stance === next;

    // Optimistic: the count under your thumb should move when you tap it.
    const previous = { stance, tails, fades };

    setStance(clearing ? null : next);
    setTails(countAfter('tail', next, clearing, previous));
    setFades(countAfter('fade', next, clearing, previous));
    setBusy(true);

    try {
      const response = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stance', betId: bet.id, stance: clearing ? null : next }),
      });
      if (!response.ok) throw new Error('rejected');
      onChanged?.();
    } catch {
      setStance(previous.stance);
      setTails(previous.tails);
      setFades(previous.fades);
    } finally {
      setBusy(false);
    }
  };

  const settle = async (next: string) => {
    const previous = result;
    setResult(next);
    try {
      const response = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'settle', betId: bet.id, result: next }),
      });
      if (!response.ok) throw new Error('rejected');
      onChanged?.();
    } catch {
      setResult(previous);
    }
  };

  return (
    <div className="card overflow-hidden">
      {/* The book's own colour along the top edge: recognisable at a glance in
          a scrolling channel, without putting a logo we have no licence to. */}
      <div className="h-[3px] w-full" style={{ background: book?.accent ?? '#8d8d8d' }} />

      <div className="px-3.5 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="display flex h-6 items-center rounded-md px-1.5 text-[10px] text-brand-ink"
              style={{ background: book?.accent ?? '#8d8d8d' }}
            >
              {book?.short ?? '•'}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
              {isParlay ? `${bet.legs.length}-leg parlay` : 'Single'}
            </span>
          </div>

          <span className="display text-[20px] leading-none tabnum text-brand">
            {formatOdds(bet.americanOdds)}
          </span>
        </div>

        <ul className="mt-2.5 space-y-1.5">
          {bet.legs.map((leg, index) => (
            <li key={`${index}-${leg.description}`} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand/70"
              />
              <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug">
                {leg.description}
              </span>
              {leg.americanOdds !== null && (
                <span className="shrink-0 text-[11px] font-bold tabnum text-muted">
                  {formatOdds(leg.americanOdds)}
                </span>
              )}
            </li>
          ))}
        </ul>

        {(bet.stake !== null || result !== 'pending') && (
          <div className="mt-3 flex items-center gap-2 border-t border-line/70 pt-2.5">
            {bet.stake !== null && (
              <>
                <Figure label="Risk" value={formatMoney(bet.stake)} />
                {profit !== null && <Figure label="To win" value={formatMoney(profit)} tone="text-win" />}
              </>
            )}
            {result !== 'pending' && (
              <span
                className={`chip ml-auto ${
                  result === 'win'
                    ? 'bg-win/15 text-win'
                    : result === 'loss'
                      ? 'bg-loss/20 text-loss'
                      : 'bg-push/20 text-push'
                }`}
              >
                {RESULT_LABEL[result] ?? result}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-stretch border-t border-line/70">
        <StanceButton
          label="Tail"
          emoji="🤝"
          count={tails}
          active={stance === 'tail'}
          disabled={busy}
          tone="win"
          onClick={() => take('tail')}
        />
        <span className="w-px bg-line/70" />
        <StanceButton
          label="Fade"
          emoji="🙅"
          count={fades}
          active={stance === 'fade'}
          disabled={busy}
          tone="brand"
          onClick={() => take('fade')}
        />
        {href && (
          <>
            <span className="w-px bg-line/70" />
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="tap flex shrink-0 items-center justify-center px-3.5 text-[11px] font-bold text-muted active:bg-raised"
            >
              {book?.name ?? 'Book'} ↗
            </a>
          </>
        )}
      </div>

      {isMine && (
        <div className="flex items-center gap-1.5 border-t border-line/70 px-3 py-2">
          <span className="mr-auto text-[10px] font-bold uppercase tracking-wide text-muted">
            How did it land?
          </span>
          {(['win', 'push', 'loss'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => settle(result === option ? 'pending' : option)}
              aria-pressed={result === option}
              className={`h-7 rounded-lg px-2.5 text-[11px] font-bold transition-colors ${
                result === option
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
      )}
    </div>
  );
}

/**
 * The counts after a tap.
 *
 * Switching from tail to fade moves one off each side, which is two changes
 * from one tap — easy to get wrong inline, so it is worked out in one place.
 */
function countAfter(
  side: Stance,
  tapped: Stance,
  clearing: boolean,
  previous: { stance: Stance | null; tails: number; fades: number },
): number {
  const current = side === 'tail' ? previous.tails : previous.fades;
  const held = previous.stance === side;

  if (clearing) return held ? Math.max(0, current - 1) : current;
  if (side === tapped) return held ? current : current + 1;
  return held ? Math.max(0, current - 1) : current;
}

function StanceButton({
  label,
  emoji,
  count,
  active,
  disabled,
  tone,
  onClick,
}: {
  label: string;
  emoji: string;
  count: number;
  active: boolean;
  disabled: boolean;
  tone: 'win' | 'brand';
  onClick: () => void;
}) {
  const activeClass = tone === 'win' ? 'bg-win/15 text-win' : 'bg-brand/15 text-brand';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`tap flex flex-1 items-center justify-center gap-1.5 text-[12px] font-bold transition-colors disabled:opacity-60 ${
        active ? activeClass : 'text-muted active:bg-raised'
      }`}
    >
      <span aria-hidden="true">{emoji}</span>
      {label}
      {count > 0 && <span className="tabnum">{count}</span>}
    </button>
  );
}

function Figure({ label, value, tone = 'text-ink' }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={`display text-[15px] leading-none tabnum ${tone}`}>{value}</div>
    </div>
  );
}
