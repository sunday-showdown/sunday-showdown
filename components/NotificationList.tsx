'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface Note {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const ICON: Record<string, string> = {
  first_place: '🏆',
  weekly_results: '📊',
  deadline_approaching: '⏰',
  picks_locked: '🔒',
  game_final: '🏁',
  passed_in_standings: '📉',
  td_scored: '🏈',
  achievements: '⭐',
  h2h_received: '⚔️',
  h2h_result: '⚔️',
};

export default function NotificationList({ notes }: { notes: readonly Note[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const unread = notes.filter((n) => !n.isRead).length;

  const markAll = async () => {
    setBusy(true);
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {unread > 0 && (
        <div className="flex items-center justify-between px-4 pb-2">
          <span className="text-xs text-muted">{unread} unread</span>
          <button type="button" onClick={markAll} disabled={busy} className="btn-ghost h-8 px-3 text-xs">
            Mark all read
          </button>
        </div>
      )}

      <div className="space-y-2 px-4">
        {notes.map((note) => (
          <article
            key={note.id}
            className={`card flex gap-3 px-4 py-3 ${note.isRead ? 'opacity-60' : 'border-brand/40'}`}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {ICON[note.type] ?? '•'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{note.title}</div>
              {note.message && (
                <div className="mt-0.5 text-sm leading-snug text-muted">{note.message}</div>
              )}
            </div>
            {!note.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
          </article>
        ))}
      </div>
    </>
  );
}
