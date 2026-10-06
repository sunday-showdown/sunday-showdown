'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Run it back.
 *
 * On the matchup page rather than only in the arena list, because the moment
 * somebody wants a rematch is the moment they have just finished reading how
 * they lost.
 */
export default function RematchButton({
  opponentId,
  name,
}: {
  opponentId: string;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const challenge = async (duration: 'week' | 'season') => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/h2h', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opponentId, duration }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result?.error ?? 'That did not work.');
        return;
      }
      router.push(`/h2h/${result.id}`);
      router.refresh();
    } catch {
      setMessage('Network error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => challenge('week')}
          className="btn-primary h-10 flex-1 text-sm"
        >
          Rematch {name}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => challenge('season')}
          className="btn-ghost h-10 px-3 text-xs"
        >
          All season
        </button>
      </div>
      {message && (
        <p role="alert" className="mt-2 text-center text-[12px] text-loss">
          {message}
        </p>
      )}
    </>
  );
}
