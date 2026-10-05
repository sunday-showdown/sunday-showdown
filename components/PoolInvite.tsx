'use client';

import { useState } from 'react';
import Sheet from './Sheet';
import Avatar from './Avatar';

export interface InviteCandidate {
  userId: string;
  username: string;
  avatarUrl: string | null;
  reason: string;
}

/**
 * Getting people into a pool.
 *
 * Three routes, because people invite three different ways. The share sheet is
 * for whoever is already in a group chat somewhere else. The code is for
 * reading out loud, which is why the alphabet it is generated from has no
 * vowels and no characters that sound alike. And sending it to a friend posts
 * the link straight into a direct message here, which is the only one of the
 * three where nobody has to copy anything.
 */
export default function PoolInvite({
  poolName,
  inviteCode,
  buyIn,
  candidates,
}: {
  poolName: string;
  inviteCode: string;
  buyIn: number;
  candidates: readonly InviteCandidate[];
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');

  // Built in the browser so it is right whether this is localhost, a preview or
  // the real domain — no environment variable to forget to set.
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/survivor/join?code=${inviteCode}`;

  const invitation = `${poolName} — survivor pool${buyIn > 0 ? `, $${buyIn} buy-in` : ''}. Join: ${link}`;

  const share = async () => {
    setNote('');
    try {
      if (navigator.share) {
        await navigator.share({ title: poolName, text: invitation, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setNote('Link copied.');
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(link);
        setNote('Link copied.');
      } catch {
        setNote('Could not share — the code above still works.');
      }
    }
  };

  const sendTo = async (person: InviteCandidate) => {
    setBusy(person.userId);
    setNote('');

    try {
      const opened = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'openDm', userId: person.userId }),
      });
      const channel = (await opened.json()) as { channelId?: string; error?: string };
      if (!opened.ok || !channel.channelId) {
        setNote(channel.error ?? 'Could not message them.');
        return;
      }

      const posted = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channel.channelId, kind: 'text', body: invitation }),
      });
      if (!posted.ok) {
        const result = (await posted.json()) as { error?: string };
        setNote(result.error ?? 'Could not send that.');
        return;
      }

      setSent((current) => new Set(current).add(person.userId));
    } catch {
      setNote('Network error.');
    } finally {
      setBusy(null);
    }
  };

  const filtered = candidates.filter((person) =>
    person.username.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <>
      <div className="px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="card flex w-full items-center gap-3 px-4 py-3 text-left active:bg-raised"
        >
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-[16px]"
          >
            ✉️
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
              Invite code
            </div>
            <div className="display mt-0.5 text-[17px] leading-none tracking-[0.18em]">
              {inviteCode}
            </div>
          </div>
          <span className="shrink-0 text-[11px] font-bold text-brand">Invite</span>
        </button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Invite to the pool">
        <div className="card mb-3 px-4 py-4 text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
            Anyone with this code can join
          </div>
          <div className="display mt-1.5 text-[34px] leading-none tracking-[0.22em]">
            {inviteCode}
          </div>
          {buyIn > 0 && (
            <div className="mt-1.5 text-[11px] text-muted">
              They will be asked for the ${buyIn} buy-in once they are in.
            </div>
          )}
        </div>

        <button type="button" onClick={share} className="btn-primary mb-3 w-full text-sm">
          Share the link
        </button>

        {note && <p className="mb-3 text-center text-[11px] text-muted">{note}</p>}

        <h3 className="eyebrow pb-2">Send it to someone</h3>

        {candidates.length > 4 && (
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people…"
            aria-label="Search people"
            className="field mb-2"
          />
        )}

        {filtered.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-muted">
            {candidates.length === 0
              ? 'Follow someone, or share the link above.'
              : `Nobody matching “${search.trim()}”.`}
          </p>
        ) : (
          <div className="space-y-1.5 pb-3">
            {filtered.map((person) => {
              const already = sent.has(person.userId);
              return (
                <button
                  key={person.userId}
                  type="button"
                  disabled={busy !== null || already}
                  onClick={() => void sendTo(person)}
                  className="card flex w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-raised disabled:opacity-70"
                >
                  <Avatar username={person.username} url={person.avatarUrl} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold">{person.username}</div>
                    <div className="text-[11px] text-muted">{person.reason}</div>
                  </div>
                  <span
                    className={`shrink-0 text-[11px] font-bold ${already ? 'text-win' : 'text-brand'}`}
                  >
                    {busy === person.userId ? '…' : already ? 'Sent' : 'Send'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Sheet>
    </>
  );
}
