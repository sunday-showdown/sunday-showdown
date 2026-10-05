'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PickCard, { type Game, type GameOdds, type Selection } from './PickCard';
import { isGamePickable, isCardLocked, timeUntilLock } from '@/lib/contest';
import { formatCountdown } from '@/lib/format';
import type { PickemMarket } from '@/lib/types';
import { pointsForOdds } from '@/lib/odds';

export interface ExistingPick {
  game_id: string;
  market_type: PickemMarket;
  selection: string;
}

interface Props {
  challengeId: string;
  lockTime: string | null;
  enabledMarkets: readonly string[];
  games: readonly Game[];
  oddsByGame: Record<string, GameOdds[]>;
  existingPicks: readonly ExistingPick[];
}

export default function PickSheet({
  challengeId,
  lockTime,
  enabledMarkets,
  games,
  oddsByGame,
  existingPicks,
}: Props) {
  const router = useRouter();

  const saved = useMemo(() => {
    const map = new Map<string, Selection>();
    for (const pick of existingPicks) {
      map.set(pick.game_id, { marketType: pick.market_type, selection: pick.selection });
    }
    return map;
  }, [existingPicks]);

  const [draft, setDraft] = useState<Map<string, Selection | null>>(new Map());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  // Ticks only to redraw the countdown; the lock itself is enforced server-side
  // and by a database trigger, never by this timer.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const locked = isCardLocked(lockTime, now);

  const current = (gameId: string): Selection | null =>
    draft.has(gameId) ? draft.get(gameId)! : (saved.get(gameId) ?? null);

  const select = (gameId: string, choice: Selection | null) => {
    setMessage(null);
    setDraft((prev) => {
      const next = new Map(prev);
      next.set(gameId, choice);
      return next;
    });
  };

  const changes = useMemo(() => {
    const picks: { gameId: string; marketType: PickemMarket; selection: string }[] = [];
    const clear: string[] = [];

    for (const [gameId, choice] of draft) {
      const original = saved.get(gameId) ?? null;
      const unchanged =
        (choice === null && original === null) ||
        (choice !== null &&
          original !== null &&
          choice.marketType === original.marketType &&
          choice.selection === original.selection);
      if (unchanged) continue;

      if (choice === null) clear.push(gameId);
      else picks.push({ gameId, marketType: choice.marketType, selection: choice.selection });
    }

    return { picks, clear };
  }, [draft, saved]);

  const dirty = changes.picks.length > 0 || changes.clear.length > 0;

  const totalSelected = games.filter((g) => current(g.id) !== null).length;
  const potentialPoints = games.reduce((sum, game) => {
    const choice = current(game.id);
    if (!choice) return sum;
    const row = (oddsByGame[game.id] ?? []).find(
      (o) => o.market_type === choice.marketType && o.selection === choice.selection,
    );
    return sum + pointsForOdds(row?.american_odds ?? null);
  }, 0);

  const save = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, picks: changes.picks, clear: changes.clear }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage({
          tone: 'error',
          text:
            response.status === 409
              ? 'Picks locked while you were choosing. Nothing was saved.'
              : (result?.error ?? 'Could not save your picks.'),
        });
        return;
      }

      if (Array.isArray(result.rejected) && result.rejected.length > 0) {
        // Rejections are surfaced, not swallowed: the player needs to know
        // which pick did not take and why.
        setMessage({ tone: 'error', text: describeRejections(result.rejected) });
      } else {
        setMessage({ tone: 'ok', text: 'Picks saved.' });
      }

      setDraft(new Map());
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: 'Network error. Your picks were not saved.' });
    } finally {
      setSaving(false);
    }
  };

  if (games.length === 0) {
    return (
      <div className="card mx-4 p-6 text-center">
        <p className="text-sm text-muted">
          This week&apos;s schedule hasn&apos;t arrived yet. Check back shortly.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-30 border-b border-line/70 bg-bg/90 px-4 py-2.5 backdrop-blur-xl">
        <div className="grid grid-cols-3 gap-2">
          <Stat
            label={locked ? 'Locked' : 'Locks in'}
            value={locked ? 'FINAL' : formatCountdown(timeUntilLock(lockTime, now))}
            tone={locked ? 'text-muted' : 'text-ink'}
          />
          <Stat
            label="Picked"
            value={`${totalSelected}/${games.length}`}
            // Green only for a genuinely complete card; 0 of 0 is not finished.
            tone={games.length > 0 && totalSelected === games.length ? 'text-win' : 'text-ink'}
            align="center"
          />
          <Stat
            label="To win"
            value={String(potentialPoints)}
            tone="text-brand text-glow"
            align="right"
          />
        </div>
      </div>

      <div className="space-y-2.5 px-4 pt-3">
        {games.map((game) => (
          <PickCard
            key={game.id}
            game={game}
            odds={oddsByGame[game.id] ?? []}
            enabledMarkets={enabledMarkets}
            selected={current(game.id)}
            pickable={!locked && isGamePickable(game.start_time, lockTime, now)}
            onSelect={(choice) => select(game.id, choice)}
          />
        ))}
      </div>

      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`mx-4 mt-3 rounded-xl px-4 py-3 text-sm ${
            message.tone === 'error' ? 'bg-loss/10 text-loss' : 'bg-brand/10 text-brand'
          }`}
        >
          {message.text}
        </p>
      )}

      {dirty && !locked && (
        <div
          className="fixed inset-x-0 bottom-14 z-40 animate-slide-up border-t border-line bg-surface/95 px-4 py-3 backdrop-blur"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex max-w-md items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setDraft(new Map());
                setMessage(null);
              }}
              className="btn-ghost h-11 px-4 text-sm"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="btn-primary h-11 flex-1 text-sm"
            >
              {saving ? 'Saving…' : `Save ${changes.picks.length + changes.clear.length} change${
                changes.picks.length + changes.clear.length === 1 ? '' : 's'
              }`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const REJECTION_TEXT: Record<string, string> = {
  card_locked: 'the card locked',
  game_started: 'the game had already started',
  market_not_enabled: 'that market is turned off this week',
  invalid_selection: 'the selection did not match the market',
  duplicate_game: 'only one pick per game is allowed',
  unknown_game: 'the game is not on this week’s slate',
  no_line: 'no line was posted for that market',
  invalid_market: 'the market is not valid',
};

function describeRejections(rejected: { gameId: string; reason: string }[]): string {
  const reasons = [...new Set(rejected.map((r) => REJECTION_TEXT[r.reason] ?? r.reason))];
  const count = rejected.length;
  return `${count} pick${count === 1 ? '' : 's'} not saved: ${reasons.join('; ')}.`;
}

/** A single readout in the sticky header. */
function Stat({
  label,
  value,
  tone = 'text-ink',
  align = 'left',
}: {
  label: string;
  value: string;
  tone?: string;
  align?: 'left' | 'center' | 'right';
}) {
  const alignment =
    align === 'center' ? 'items-center' : align === 'right' ? 'items-end' : 'items-start';

  return (
    <div className={`flex flex-col ${alignment}`}>
      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">{label}</span>
      <span className={`display text-[22px] leading-[1.05] tabnum ${tone}`}>{value}</span>
    </div>
  );
}
