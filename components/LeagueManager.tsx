'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface Member {
  userId: string;
  username: string;
  isCommissioner: boolean;
  points: number;
  rank: number | null;
}

interface Props {
  leagueId: string;
  name: string;
  inviteCode: string;
  season: number;
  members: readonly Member[];
  isCommissioner: boolean;
  myId: string;
}

export default function LeagueManager({
  leagueId,
  name,
  inviteCode,
  season,
  members,
  isCommissioner,
  myId,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const joinUrl =
    typeof window === 'undefined'
      ? ''
      : `${window.location.origin}/leagues/join?code=${inviteCode}`;

  const share = async () => {
    const text = `Join my Sunday Showdown league "${name}" — code ${inviteCode}`;
    // The native sheet is the right affordance on iPhone; clipboard is the
    // fallback everywhere else.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Sunday Showdown', text, url: joinUrl });
        return;
      } catch {
        // Cancelled, or not permitted — fall through to copying.
      }
    }
    await copy(joinUrl || inviteCode, 'Invite link copied.');
  };

  const copy = async (value: string, success: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage({ tone: 'ok', text: success });
    } catch {
      setMessage({ tone: 'error', text: 'Could not copy. Long-press the code instead.' });
    }
  };

  const rename = async () => {
    setBusy('rename');
    setMessage(null);
    try {
      const response = await fetch(`/api/leagues/${leagueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draftName }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage({ tone: 'error', text: result?.error ?? 'Could not rename.' });
        return;
      }
      setEditing(false);
      setMessage({ tone: 'ok', text: 'League renamed.' });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (memberId: string, label: string) => {
    setBusy(memberId);
    setMessage(null);
    try {
      const response = await fetch(`/api/leagues/${leagueId}?member=${memberId}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage({ tone: 'error', text: result?.error ?? 'Could not remove.' });
        return;
      }
      setMessage({ tone: 'ok', text: `${label} removed.` });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`mx-4 mb-3 rounded-xl px-4 py-3 text-sm ${
            message.tone === 'error' ? 'bg-loss/15 text-loss' : 'bg-brand/15 text-brand'
          }`}
        >
          {message.text}
        </p>
      )}

      {/* The invite code, treated as the hero it is — this is how a league grows. */}
      <section className="px-4">
        <div className="card card-hot overflow-hidden p-5 text-center">
          <div className="eyebrow justify-center">Invite code</div>
          <div className="display mt-2 text-[44px] leading-none tracking-[0.18em] text-glow">
            {inviteCode}
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={share} className="btn-primary flex-1 text-sm">
              Share
            </button>
            <button
              type="button"
              onClick={() => copy(inviteCode, 'Code copied.')}
              className="btn-ghost flex-1 text-sm"
            >
              Copy code
            </button>
          </div>
        </div>
      </section>

      <section className="mt-5 px-4">
        <div className="flex items-center justify-between pb-2">
          <h2 className="eyebrow">
            {members.length} member{members.length === 1 ? '' : 's'}
          </h2>
          {isCommissioner && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[11px] font-bold text-brand"
            >
              Rename league
            </button>
          )}
        </div>

        {editing && (
          <div className="card mb-3 p-4">
            <label htmlFor="league-name" className="mb-1.5 block text-sm font-medium">
              League name
            </label>
            <input
              id="league-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="field"
              minLength={3}
              maxLength={48}
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraftName(name);
                }}
                className="btn-ghost flex-1 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={rename}
                disabled={busy === 'rename' || draftName.trim().length < 3}
                className="btn-primary flex-1 text-sm"
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {members.map((member) => (
            <div key={member.userId} className="card flex items-center gap-3 px-4 py-3">
              <span
                className={`display flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[15px] ${
                  member.rank === 1 ? 'bg-gold/15 text-gold' : 'bg-raised text-muted'
                }`}
              >
                {member.rank ?? '–'}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-bold">{member.username}</span>
                  {member.userId === myId && (
                    <span className="chip bg-brand/15 text-brand">You</span>
                  )}
                </div>
                <div className="text-[11px] text-muted">
                  {member.isCommissioner ? 'Commissioner' : `Season ${season}`}
                </div>
              </div>

              <span className="display shrink-0 text-[19px] leading-none tabnum">
                {Math.round(member.points)}
              </span>

              {isCommissioner && !member.isCommissioner && (
                <button
                  type="button"
                  disabled={busy === member.userId}
                  onClick={() => remove(member.userId, member.username)}
                  aria-label={`Remove ${member.username}`}
                  className="tap -mr-2 shrink-0 px-2 text-[18px] leading-none text-muted"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {!isCommissioner && (
        <section className="mt-6 px-4">
          <button
            type="button"
            disabled={busy === myId}
            onClick={() => remove(myId, 'You')}
            className="btn-ghost w-full text-sm text-loss"
          >
            Leave this league
          </button>
        </section>
      )}
    </>
  );
}
