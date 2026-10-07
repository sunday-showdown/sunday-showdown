'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SPORTSBOOKS } from '@/lib/sportsbooks';

export interface NotificationPrefs {
  deadline_approaching: boolean;
  picks_locked: boolean;
  game_final: boolean;
  first_place: boolean;
  passed_in_standings: boolean;
  td_scored: boolean;
  weekly_results: boolean;
  achievements: boolean;
}

const NOTIFICATIONS: { key: keyof NotificationPrefs; title: string; blurb: string }[] = [
  { key: 'deadline_approaching', title: 'Lock reminders', blurb: 'When your card is unfinished and the week is about to close.' },
  { key: 'weekly_results', title: 'Weekly results', blurb: 'How the week went, once everything is final.' },
  { key: 'first_place', title: 'Week wins', blurb: 'When you take a week outright.' },
  { key: 'passed_in_standings', title: 'Standings moves', blurb: 'When somebody goes past you.' },
  { key: 'game_final', title: 'Game results', blurb: 'As the games you picked finish.' },
  { key: 'td_scored', title: 'TD Scorer', blurb: 'When one of your scorers finds the end zone.' },
  { key: 'achievements', title: 'Badges', blurb: 'When you earn one.' },
  { key: 'picks_locked', title: 'Lock confirmation', blurb: 'When the week locks with your card in.' },
];

/**
 * Everything about you that you can change.
 *
 * There was no settings screen at all: a username was fixed at signup, a
 * password could only be changed through the forgotten-password flow, the
 * notification columns had existed since the first schema with nothing in the
 * app to write them, and the books somebody actually uses were never asked for.
 *
 * Each section saves on its own. One big Save at the bottom would mean a failed
 * password change silently discards a username change made at the same time.
 */
export default function SettingsPanel({
  username,
  preferredBooks,
  prefs,
}: {
  username: string;
  preferredBooks: readonly string[];
  prefs: NotificationPrefs;
}) {
  const router = useRouter();

  return (
    <div className="space-y-6 px-4">
      <NameSection initial={username} onSaved={() => router.refresh()} />
      <PasswordSection />
      <BooksSection initial={preferredBooks} onSaved={() => router.refresh()} />
      <NotificationsSection initial={prefs} />
    </div>
  );
}

function Section({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="eyebrow pb-1.5">{title}</h2>
      {blurb && <p className="pb-2.5 text-[12px] leading-relaxed text-muted">{blurb}</p>}
      {children}
    </section>
  );
}

function Note({ tone, children }: { tone: 'ok' | 'error'; children: React.ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`mt-2 text-[12px] ${tone === 'error' ? 'text-loss' : 'text-win'}`}
    >
      {children}
    </p>
  );
}

function NameSection({ initial, onSaved }: { initial: string; onSaved: () => void }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name }),
      });
      const result = await response.json();
      if (!response.ok) {
        setNote({ tone: 'error', text: result?.error ?? 'That did not save.' });
        return;
      }
      setNote({ tone: 'ok', text: 'Saved.' });
      onSaved();
    } catch {
      setNote({ tone: 'error', text: 'Network error.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Username" blurb="What everybody sees on the boards and in chat.">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={20}
          aria-label="Username"
          className="field min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy || name === initial || name.length < 3}
          className="btn-ghost h-11 shrink-0 px-4 text-sm"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {note && <Note tone={note.tone}>{note.text}</Note>}
    </Section>
  );
}

function PasswordSection() {
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const save = async () => {
    if (next.length < 8) {
      setNote({ tone: 'error', text: 'At least 8 characters.' });
      return;
    }
    if (next !== confirm) {
      setNote({ tone: 'error', text: 'Those two do not match.' });
      return;
    }

    setBusy(true);
    setNote(null);
    // Straight to Supabase auth rather than through an API route: the password
    // never needs to touch this app's server, and the session already proves
    // who is asking.
    const { error } = await createClient().auth.updateUser({ password: next });
    setBusy(false);

    if (error) {
      setNote({ tone: 'error', text: error.message });
      return;
    }
    setNext('');
    setConfirm('');
    setNote({ tone: 'ok', text: 'Password changed.' });
  };

  return (
    <Section title="Password" blurb="Signed in with Apple or Google? You have no password to change.">
      <div className="space-y-2">
        <input
          type="password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          placeholder="New password"
          autoComplete="new-password"
          aria-label="New password"
          className="field"
        />
        <input
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="Again"
          autoComplete="new-password"
          aria-label="Confirm new password"
          className="field"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy || next === ''}
          className="btn-ghost w-full text-sm"
        >
          {busy ? 'Changing…' : 'Change password'}
        </button>
      </div>
      {note && <Note tone={note.tone}>{note.text}</Note>}
    </Section>
  );
}

function BooksSection({ initial, onSaved }: { initial: readonly string[]; onSaved: () => void }) {
  const [chosen, setChosen] = useState<string[]>([...initial]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const toggle = (id: string) =>
    setChosen((current) =>
      current.includes(id) ? current.filter((book) => book !== id) : [...current, id],
    );

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredBooks: chosen }),
      });
      if (!response.ok) {
        setNote({ tone: 'error', text: 'That did not save.' });
        return;
      }
      setNote({ tone: 'ok', text: 'Saved.' });
      onSaved();
    } catch {
      setNote({ tone: 'error', text: 'Network error.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Your sportsbooks"
      blurb="Only these appear when you log a bet. Pick none and you get the full list."
    >
      <div className="flex flex-wrap gap-1.5">
        {SPORTSBOOKS.filter((book) => book.id !== 'other').map((book) => {
          const on = chosen.includes(book.id);
          return (
            <button
              key={book.id}
              type="button"
              onClick={() => toggle(book.id)}
              aria-pressed={on}
              className={`h-9 rounded-xl border px-3 text-[13px] font-bold leading-none transition-colors ${
                on ? 'border-transparent text-bg' : 'border-line bg-raised text-muted'
              }`}
              style={on ? { backgroundColor: book.accent } : undefined}
            >
              {book.name}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="btn-ghost mt-2.5 w-full text-sm"
      >
        {busy ? 'Saving…' : 'Save books'}
      </button>
      {note && <Note tone={note.tone}>{note.text}</Note>}
    </Section>
  );
}

function NotificationsSection({ initial }: { initial: NotificationPrefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const flip = async (key: keyof NotificationPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    // Flipped first, saved second: a switch that waits for the network before
    // moving feels broken, and the worst case is it snaps back.
    setPrefs(next);
    setNote(null);

    try {
      const response = await fetch('/api/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next[key] }),
      });
      if (!response.ok) {
        setPrefs(prefs);
        setNote({ tone: 'error', text: 'That did not save.' });
      }
    } catch {
      setPrefs(prefs);
      setNote({ tone: 'error', text: 'Network error.' });
    }
  };

  return (
    <Section title="Notifications" blurb="These apply to the bell and to anything pushed to your phone.">
      <div className="card overflow-hidden">
        <ul className="divide-y divide-line/60">
          {NOTIFICATIONS.map((option) => (
            <li key={option.key} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold">{option.title}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                  {option.blurb}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[option.key]}
                aria-label={option.title}
                onClick={() => flip(option.key)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  prefs[option.key] ? 'bg-brand' : 'bg-line'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-ink transition-[left] ${
                    prefs[option.key] ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
      {note && <Note tone={note.tone}>{note.text}</Note>}
    </Section>
  );
}
