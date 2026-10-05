'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { REACTIONS } from '@/lib/reactions';


export interface FeedItem {
  id: string;
  activityType: string;
  message: string;
  createdAt: string;
  week: number | null;
  reactions: Record<string, number>;
  myReactions: string[];
}

const ICON: Record<string, string> = {
  week_winner: '🏆',
  big_upset: '🎯',
  perfect_week: '💯',
  streak: '🔥',
  survivor_out: '💀',
  survivor_won: '👑',
  joined: '👋',
  milestone: '⭐',
};

export default function ActivityItem({ item }: { item: FeedItem }) {
  const router = useRouter();
  // Optimistic so a tap feels instant; the server is still the authority and a
  // refresh reconciles.
  const [reactions, setReactions] = useState(item.reactions);
  const [mine, setMine] = useState(new Set(item.myReactions));
  const [picking, setPicking] = useState(false);

  const react = async (emoji: string) => {
    const had = mine.has(emoji);

    setReactions((prev) => {
      const next = { ...prev };
      next[emoji] = Math.max(0, (next[emoji] ?? 0) + (had ? -1 : 1));
      if (next[emoji] === 0) delete next[emoji];
      return next;
    });
    setMine((prev) => {
      const next = new Set(prev);
      if (had) next.delete(emoji);
      else next.add(emoji);
      return next;
    });
    setPicking(false);

    try {
      await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId: item.id, emoji }),
      });
      router.refresh();
    } catch {
      // Put it back if the write never landed.
      setReactions(item.reactions);
      setMine(new Set(item.myReactions));
    }
  };

  const active = Object.entries(reactions).filter(([, count]) => count > 0);

  return (
    <article className="card px-4 py-3">
      <div className="flex gap-3">
        <span aria-hidden="true" className="text-lg leading-none">
          {ICON[item.activityType] ?? '•'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug">{item.message}</p>
          <p className="mt-1 text-[11px] text-muted">
            {item.week !== null && `Week ${item.week} · `}
            {relativeTime(item.createdAt)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {active.map(([emoji, count]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => react(emoji)}
                aria-pressed={mine.has(emoji)}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                  mine.has(emoji) ? 'border-brand bg-brand/15 text-ink' : 'border-line bg-raised text-muted'
                }`}
              >
                <span aria-hidden="true">{emoji}</span>
                <span className="tabnum">{count}</span>
              </button>
            ))}

            {picking ? (
              <span className="flex items-center gap-1 rounded-full border border-line bg-raised px-1.5 py-0.5">
                {REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => react(emoji)}
                    aria-label={`React ${emoji}`}
                    className="px-1 text-base leading-none"
                  >
                    {emoji}
                  </button>
                ))}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setPicking(true)}
                aria-label="Add a reaction"
                className="rounded-full border border-line bg-raised px-2 py-0.5 text-xs text-muted"
              >
                +
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
