'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export interface Note {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  /** Where this notification is about, if anywhere. */
  url: string | null;
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
  duel_round: '🩸',
  survivor_eliminated: '🛡️',
  mention: '💬',
  direct_message: '✉️',
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

  // Fire and forget: the navigation must not wait on it, and an unread dot that
  // lingers is a smaller problem than a tap that stalls.
  const markOne = (note: Note) => {
    if (note.isRead) return;
    fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: note.id }),
    }).catch(() => {});
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
        {notes.map((note) => {
          const body = (
            <>
              <span aria-hidden="true" className="text-lg leading-none">
                {ICON[note.type] ?? '•'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{note.title}</span>
                {note.message && (
                  <span className="mt-0.5 block text-sm leading-snug text-muted">
                    {note.message}
                  </span>
                )}
              </span>
              {!note.isRead && (
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
              )}
            </>
          );

          const className = `card flex gap-3 px-4 py-3 ${
            note.isRead ? 'opacity-60' : 'border-brand/40'
          }`;

          // A notification with somewhere to go is a link. Tapping one used to
          // do nothing, which left the bell as a list of things to go and find
          // yourself — and a push already lands on the right screen, so the
          // in-app copy behaving differently was the odd one out.
          return note.url ? (
            <Link
              key={note.id}
              href={note.url}
              onClick={() => markOne(note)}
              className={`${className} active:bg-raised`}
            >
              {body}
            </Link>
          ) : (
            <article key={note.id} className={className}>
              {body}
            </article>
          );
        })}
      </div>
    </>
  );
}
