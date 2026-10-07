'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { archetypeOf, fighterRecord } from '@/lib/fighters';
import FighterArt from './FighterArt';
import type { Duel } from '@/lib/duels';

/**
 * Being called out.
 *
 * A challenge used to appear as a row in a list with an Accept button, which is
 * a fine way to show a calendar invitation and a poor way to tell somebody that
 * a person they know has decided to fight them. This is the moment the feature
 * exists for, so it gets the screen: the opponent's fighter walks in, their
 * taunt lands, and the only two things to do are take it or not.
 *
 * Shown once. The `seen` call marks the row so re-opening the arena does not
 * replay it — an animation that fires every time you visit a screen stops being
 * an event and becomes a loading delay.
 *
 * Portalled to <body> for the reason documented in components/Sheet.tsx: `main`
 * has a z-index and therefore a stacking context, so anything inside it renders
 * under the bottom nav however large its own z-index is.
 */
export default function ChallengeAlert({
  duel,
  onAccept,
  onDecline,
  busy,
}: {
  duel: Duel;
  onAccept: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => setMounted(true), []);

  // Marked seen as soon as it is shown, not when it is answered: somebody who
  // swipes the app away has still been told.
  useEffect(() => {
    fetch('/api/h2h', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: duel.id, action: 'seen' }),
    }).catch(() => {
      // Worst case it plays once more.
    });
  }, [duel.id]);

  // Keyed on `dismissed`, not just on mount. Dismissing this returns null from
  // the render, which does not unmount the component — so an effect that only
  // cleaned up on unmount left `overflow: hidden` on the body and the arena
  // behind it could not be scrolled.
  useEffect(() => {
    if (dismissed) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissed(true);
    };
    window.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [dismissed]);

  if (!mounted || dismissed) return null;

  const fighter = duel.them.fighter;
  const archetype = archetypeOf(fighter.archetype);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${fighter.name} has challenged you`}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-bg/95 px-6 backdrop-blur-sm"
      style={{ animation: 'pop-in 220ms ease-out both' }}
    >
      {/* A red pulse behind the fighter, so the screen reads as a threat
          rather than as a form. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 46% at 50% 42%, rgb(var(--brand) / 0.3) 0%, transparent 72%)',
          animation: 'challenge-pulse 2.2s ease-in-out infinite',
        }}
      />

      <p className="display text-[11px] tracking-[0.3em] text-brand">Challenger approaching</p>

      <div
        className="mt-4 flex items-center justify-center"
        style={{ animation: 'challenge-stomp 1.1s cubic-bezier(0.22, 1, 0.36, 1) both' }}
      >
        <FighterArt archetype={fighter.archetype} banner={fighter.banner} size={132} frame="full" />
      </div>

      <h2 className="display mt-4 text-center text-[32px] leading-[0.95]">{fighter.name}</h2>
      <p className="mt-1 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
        {duel.them.username} · {archetype.name} · {fighterRecord(fighter)}
      </p>

      {fighter.taunt && (
        <p
          className="mt-4 max-w-[18rem] text-balance text-center text-[15px] font-semibold italic text-ink"
          style={{ animation: 'pop-in 420ms ease-out 700ms both' }}
        >
          “{fighter.taunt}”
        </p>
      )}

      <p className="mt-4 text-center text-[13px] text-muted">
        {duel.duration === 'season'
          ? 'Wants you for the whole season. Every week, until one of you drops.'
          : `Wants you for week ${duel.week}. Highest card wins.`}
      </p>

      <div
        className="mt-7 flex w-full max-w-xs flex-col gap-2"
        style={{ animation: 'pop-in 300ms ease-out 900ms both' }}
      >
        <button type="button" disabled={busy} onClick={onAccept} className="btn-primary text-[16px]">
          Fight
        </button>
        <button type="button" disabled={busy} onClick={onDecline} className="btn-ghost text-sm">
          Back down
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="h-9 text-[12px] font-semibold text-muted"
        >
          Decide later
        </button>
      </div>
    </div>,
    document.body,
  );
}
