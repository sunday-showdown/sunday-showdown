'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Sheet from './Sheet';
import Avatar from './Avatar';
import { formatRelative } from '@/lib/format';
import type { ChannelSummary } from '@/lib/chat';

export interface DmCandidate {
  userId: string;
  username: string;
  avatarUrl: string | null;
  /** "In your league", "You follow them" — why they are on the list. */
  reason: string;
}

/**
 * The rooms, as a list.
 *
 * Grouped by league, with the active one first, rather than showing a single
 * league's rooms and silently dropping the rest — which is what it did, and
 * which made a second league look like it had no chat at all.
 *
 * Within a group, sorted by what has happened rather than by name: unread
 * first, then most recently active. A channel list ordered alphabetically makes
 * you hunt for the conversation you are actually in.
 */
export default function ChannelList({
  channels,
  leagues,
  leagueId,
  isCommissioner,
  candidates,
}: {
  channels: readonly ChannelSummary[];
  leagues: readonly { id: string; name: string }[];
  leagueId: string | null;
  isCommissioner: boolean;
  candidates: readonly DmCandidate[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const dms = [...channels.filter((c) => c.kind === 'dm')].sort(byActivity);

  // Active league first, then the rest in the order the account lists them.
  const groups = [...leagues]
    .sort((a, b) => Number(b.id === leagueId) - Number(a.id === leagueId))
    .map((league) => ({
      league,
      rooms: channels.filter((c) => c.kind !== 'dm' && c.leagueId === league.id).sort(byActivity),
    }))
    .filter((group) => group.rooms.length > 0);

  const create = async () => {
    if (!leagueId) return;
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', leagueId, name, topic }),
      });
      const result = (await response.json()) as { error?: string; channelId?: string };

      if (!response.ok || !result.channelId) {
        setError(result.error ?? 'Could not create that channel.');
        return;
      }

      setCreating(false);
      setName('');
      setTopic('');
      router.push(`/feed/c/${result.channelId}`);
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const openDm = async (userId: string) => {
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
        setError(result.error ?? 'Could not open that conversation.');
        return;
      }

      setDmOpen(false);
      router.push(`/feed/c/${result.channelId}`);
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  const filtered = candidates.filter((person) =>
    person.username.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="pb-4">
      {error && (
        <p role="alert" className="mx-4 mb-3 rounded-xl bg-loss/15 px-4 py-3 text-[12px] text-loss">
          {error}
        </p>
      )}

      <section>
        <div className="px-4 pb-2">
          <Link href="/feed/highlights" className="card flex items-center gap-3 px-3.5 py-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-[18px]"
            >
              📣
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-bold">Highlights</div>
              <div className="truncate text-[11.5px] text-muted">
                Results, upsets and streaks, written by the app
              </div>
            </div>
            <span className="shrink-0 text-muted">›</span>
          </Link>
        </div>
      </section>

      {groups.map((group) => {
        const unread = group.rooms.reduce((sum, room) => sum + room.unread, 0);
        const isActive = group.league.id === leagueId;

        return (
          <section key={group.league.id} className="mt-4">
            <div className="flex items-center justify-between gap-2 px-4 pb-2">
              <h2 className="eyebrow min-w-0">
                <span className="truncate">
                  {groups.length > 1 ? group.league.name : 'Channels'}
                </span>
                {unread > 0 && (
                  <span className="display ml-1 rounded-full bg-brand px-1.5 text-[9px] text-brand-ink tabnum">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </h2>

              {isActive && (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="shrink-0 text-[11px] font-bold text-brand"
                >
                  + New
                </button>
              )}
            </div>

            <div className="space-y-1.5 px-4">
              {group.rooms.map((channel) => (
                <ChannelRow key={channel.id} channel={channel} />
              ))}
            </div>
          </section>
        );
      })}

      <section className="mt-5">
        <div className="flex items-center justify-between px-4 pb-2">
          <h2 className="eyebrow">Direct messages</h2>
          <button
            type="button"
            onClick={() => setDmOpen(true)}
            className="text-[11px] font-bold text-brand"
          >
            + Message
          </button>
        </div>

        <div className="space-y-1.5 px-4">
          {dms.length === 0 ? (
            <button
              type="button"
              onClick={() => setDmOpen(true)}
              className="card w-full px-4 py-4 text-left"
            >
              <div className="text-[14px] font-bold">No conversations yet</div>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                Message anyone in your league, or anyone you follow.
              </p>
            </button>
          ) : (
            dms.map((channel) => <ChannelRow key={channel.id} channel={channel} />)
          )}
        </div>
      </section>

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title="New channel"
        footer={
          <button
            type="button"
            disabled={busy || name.trim().length < 2}
            onClick={create}
            className="btn-primary w-full text-sm"
          >
            {busy ? 'Creating…' : 'Create channel'}
          </button>
        }
      >
        <label htmlFor="channel-name" className="eyebrow pb-1.5">
          Name
        </label>
        <input
          id="channel-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          placeholder="injury-news"
          className="field"
        />
        <p className="mb-4 mt-1.5 text-[11px] text-muted">
          Lowercase with hyphens, like Discord. Spaces become hyphens.
        </p>

        <label htmlFor="channel-topic" className="eyebrow pb-1.5">
          Topic
        </label>
        <input
          id="channel-topic"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          maxLength={200}
          placeholder="What is this one for?"
          className="field mb-3"
        />

        {!isCommissioner && (
          <p className="pb-2 text-[11px] leading-relaxed text-muted">
            Anyone in the league can add a channel. Only the commissioner can
            remove one.
          </p>
        )}
      </Sheet>

      <Sheet open={dmOpen} onClose={() => setDmOpen(false)} title="Start a conversation">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search people…"
          aria-label="Search people"
          className="field mb-3"
        />

        {filtered.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-muted">
            {candidates.length === 0
              ? 'Join a league or follow someone first.'
              : `Nobody matching “${search.trim()}”.`}
          </p>
        ) : (
          <div className="space-y-1.5 pb-3">
            {filtered.map((person) => (
              <button
                key={person.userId}
                type="button"
                disabled={busy}
                onClick={() => void openDm(person.userId)}
                className="card flex w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-raised disabled:opacity-60"
              >
                <Avatar username={person.username} url={person.avatarUrl} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold">{person.username}</div>
                  <div className="text-[11px] text-muted">{person.reason}</div>
                </div>
                <span className="shrink-0 text-muted">›</span>
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function ChannelRow({ channel }: { channel: ChannelSummary }) {
  const isDm = channel.kind === 'dm';
  const label = isDm ? (channel.partner?.username ?? 'Direct message') : channel.name;

  return (
    <Link
      href={`/feed/c/${channel.id}`}
      className={`card flex items-center gap-3 px-3.5 py-3 ${channel.unread > 0 ? 'card-hot' : ''}`}
    >
      {isDm && channel.partner ? (
        <Avatar username={channel.partner.username} size="md" />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised text-[17px]"
        >
          {channel.emoji ?? '💬'}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {!isDm && <span className="text-[14px] font-bold text-muted">#</span>}
          <span
            className={`min-w-0 truncate text-[14.5px] ${
              channel.unread > 0 ? 'font-extrabold' : 'font-bold'
            }`}
          >
            {label}
          </span>
        </div>
        {channel.topic && !isDm && (
          <div className="truncate text-[11.5px] text-muted">{channel.topic}</div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {channel.lastMessageAt && (
          <span className="text-[10px] text-muted">{formatRelative(channel.lastMessageAt)}</span>
        )}
        {channel.unread > 0 && (
          <span className="display flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] text-brand-ink tabnum">
            {channel.unread > 99 ? '99+' : channel.unread}
          </span>
        )}
      </div>
    </Link>
  );
}

/** Unread first, then most recently active, then newest room. */
function byActivity(a: ChannelSummary, b: ChannelSummary): number {
  if (a.unread !== b.unread) return b.unread - a.unread;
  const left = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
  const right = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
  if (left !== right) return right - left;
  return a.name.localeCompare(b.name);
}
