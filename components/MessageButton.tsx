'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Start a direct message with this person.
 *
 * open_dm is idempotent on the pair, so this always lands in the one
 * conversation the two of you have rather than making a new one each tap.
 */
export default function MessageButton({ userId }: { userId: string }) {
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
        body: JSON.stringify({ action: 'openDm', userId }),
      });
      const result = (await response.json()) as { error?: string; channelId?: string };

      if (!response.ok || !result.channelId) {
        setError(result.error ?? 'Could not open that.');
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
    <>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="h-8 rounded-xl border border-line bg-raised px-3 text-[11px] font-bold text-ink active:bg-line/50 disabled:opacity-60"
      >
        {busy ? '…' : 'Message'}
      </button>
      {error && <span className="text-[10px] text-loss">{error}</span>}
    </>
  );
}
