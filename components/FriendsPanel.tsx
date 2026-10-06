'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Avatar from './Avatar';
import { useRouter } from 'next/navigation';

export interface FriendRow {
  userId: string;
  username: string;
  avatarUrl: string | null;
  favoriteTeam: string | null;
  following: boolean;
  followsYou: boolean;
  points: number | null;
}

interface SearchHit {
  userId: string;
  username: string;
  avatarUrl: string | null;
  favoriteTeam: string | null;
  following: boolean;
}

export default function FriendsPanel({ friends }: { friends: readonly FriendRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Debounced so typing a name is one request at the end, not one per keystroke.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/friends?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        setResults(data.results ?? []);
      } catch {
        // Aborted by the next keystroke, or offline. Either way, leave the
        // last results alone rather than flashing an error.
      } finally {
        setSearching(false);
      }
    }, 280);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const toggle = async (userId: string, follow: boolean) => {
    setBusy(userId);
    // Optimistic: the tap should feel instant, and the server is still the
    // authority when the page refreshes.
    setResults((prev) => prev.map((r) => (r.userId === userId ? { ...r, following: follow } : r)));

    try {
      await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, follow }),
      });
      router.refresh();
    } catch {
      setResults((prev) => prev.map((r) => (r.userId === userId ? { ...r, following: !follow } : r)));
    } finally {
      setBusy(null);
    }
  };

  const mutual = friends.filter((f) => f.following && f.followsYou);
  const following = friends.filter((f) => f.following && !f.followsYou);
  const followers = friends.filter((f) => !f.following && f.followsYou);

  return (
    <>
      <section className="px-4">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find someone by username"
          aria-label="Find someone by username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="field"
        />
      </section>

      {query.trim().length >= 2 && (
        <section className="mt-3 px-4">
          <h2 className="eyebrow pb-2">{searching ? 'Searching' : `${results.length} found`}</h2>
          <div className="space-y-2">
            {results.length === 0 && !searching && (
              <p className="py-6 text-center text-sm text-muted">
                Nobody by that name. Usernames are exact-ish — try fewer letters.
              </p>
            )}
            {results.map((hit) => (
              <PersonRow
                key={hit.userId}
                userId={hit.userId}
                username={hit.username}
                avatarUrl={hit.avatarUrl}
                subtitle={hit.favoriteTeam ?? 'Sunday Showdown'}
                following={hit.following}
                busy={busy === hit.userId}
                onToggle={() => toggle(hit.userId, !hit.following)}
              />
            ))}
          </div>
        </section>
      )}

      {query.trim().length < 2 && (
        <>
          <Group title={`Friends · ${mutual.length}`} rows={mutual} busy={busy} onToggle={toggle} />
          <Group
            title={`Following · ${following.length}`}
            rows={following}
            busy={busy}
            onToggle={toggle}
          />
          <Group
            title={`Follows you · ${followers.length}`}
            rows={followers}
            busy={busy}
            onToggle={toggle}
          />

          {friends.length === 0 && (
            <p className="px-8 pt-10 text-center text-sm leading-relaxed text-muted">
              Search a username above to follow someone. Follow each other and
              you&apos;re friends — their results show up in your feed.
            </p>
          )}
        </>
      )}
    </>
  );
}

function Group({
  title,
  rows,
  busy,
  onToggle,
}: {
  title: string;
  rows: readonly FriendRow[];
  busy: string | null;
  onToggle: (userId: string, follow: boolean) => void;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="mt-5 px-4">
      <h2 className="eyebrow pb-2">{title}</h2>
      <div className="space-y-2">
        {rows.map((row) => (
          <PersonRow
            key={row.userId}
            userId={row.userId}
            username={row.username}
            avatarUrl={row.avatarUrl}
            subtitle={
              row.points !== null
                ? `${Math.round(row.points)} pts this season`
                : (row.favoriteTeam ?? 'Sunday Showdown')
            }
            following={row.following}
            busy={busy === row.userId}
            onToggle={() => onToggle(row.userId, !row.following)}
          />
        ))}
      </div>
    </section>
  );
}

function PersonRow({
  userId,
  username,
  avatarUrl = null,
  subtitle,
  following,
  busy,
  onToggle,
}: {
  userId: string;
  username: string;
  avatarUrl?: string | null;
  subtitle: string;
  following: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="card flex items-center gap-3 px-3.5 py-2.5">
      <Avatar username={username} url={avatarUrl} size="lg" />

      <Link href={`/u/${userId}`} className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold">{username}</div>
        <div className="truncate text-[11px] text-muted">{subtitle}</div>
      </Link>

      <button
        type="button"
        disabled={busy}
        onClick={onToggle}
        aria-pressed={following}
        className={`h-9 shrink-0 rounded-xl px-3.5 text-xs font-bold transition-colors ${
          following ? 'border border-line bg-raised text-muted' : 'bg-brand text-brand-ink'
        }`}
      >
        {following ? 'Following' : 'Follow'}
      </button>
    </div>
  );
}
