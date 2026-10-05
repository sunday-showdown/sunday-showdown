'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function FollowButton({
  userId,
  initiallyFollowing,
}: {
  userId: string;
  initiallyFollowing: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initiallyFollowing);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    const next = !following;
    setFollowing(next);
    setBusy(true);
    try {
      await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, follow: next }),
      });
      router.refresh();
    } catch {
      setFollowing(!next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={toggle}
      aria-pressed={following}
      className={`h-9 shrink-0 rounded-xl px-4 text-xs font-bold transition-colors ${
        following ? 'border border-line bg-raised text-muted' : 'bg-brand text-brand-ink'
      }`}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}
