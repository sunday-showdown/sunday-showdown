'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Run the introduction again.
 *
 * Clearing onboarded_at is all it takes — the layout shows the tour whenever
 * that column is null. Here because skipping the tour is meant to be a real
 * choice rather than a trap, and the only way for that to be true is for there
 * to be a way back.
 */
export default function ReplayTour() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const replay = async () => {
    setBusy(true);
    try {
      await fetch('/api/onboarding', { method: 'DELETE' });
      router.push('/home');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={replay} disabled={busy} className="btn-ghost w-full text-sm">
      {busy ? 'One moment…' : 'Show me around again'}
    </button>
  );
}
