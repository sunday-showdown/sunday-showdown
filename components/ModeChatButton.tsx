'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PotMode } from '@/lib/pot';

/**
 * Open this mode's room.
 *
 * The channel is created the first time somebody taps it rather than seeded
 * with the league, so a league that never plays survivor does not carry an
 * empty survivor channel around all season. ensure_mode_channel is idempotent
 * and handles two people tapping at once, so this can be a plain button with no
 * state to reconcile.
 */
export default function ModeChatButton({
  leagueId,
  mode,
  label,
}: {
  leagueId: string;
  mode: PotMode;
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const open = async () => {
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ensureMode', leagueId, mode }),
      });
      const result = (await response.json()) as { error?: string; channelId?: string };

      if (!response.ok || !result.channelId) {
        setError(result.error ?? 'Could not open that room.');
        return;
      }
      router.push(`/feed/c/${result.channelId}`);
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4">
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="card flex w-full items-center gap-3 px-4 py-3 text-left active:bg-raised disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-[16px]"
        >
          💬
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
            {label} chat
          </div>
          <div className="mt-0.5 text-[13.5px] font-bold">
            {busy ? 'Opening…' : 'Talk about this mode'}
          </div>
        </div>
        <span className="shrink-0 text-muted">›</span>
      </button>

      {error && <p className="mt-2 text-[11px] text-loss">{error}</p>}
    </div>
  );
}
