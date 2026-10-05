'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface Challenge {
  id: string;
  status: string;
  week: number;
  opponentName: string;
  iAmChallenger: boolean;
  challengerScore: number | null;
  opponentScore: number | null;
  winnerId: string | null;
  myId: string;
}

export interface LeagueMate {
  userId: string;
  username: string;
  record: string | null;
}

interface Props {
  leagueId: string;
  season: number;
  week: number;
  challenges: readonly Challenge[];
  mates: readonly LeagueMate[];
}

export default function H2HPanel({ leagueId, season, week, challenges, mates }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const call = async (url: string, init: RequestInit, key: string, success: string) => {
    setBusy(key);
    setMessage(null);
    try {
      const response = await fetch(url, init);
      const result = await response.json();
      if (!response.ok) {
        setMessage({ tone: 'error', text: result?.error ?? 'That did not work.' });
        return;
      }
      setMessage({ tone: 'ok', text: success });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: 'Network error.' });
    } finally {
      setBusy(null);
    }
  };

  const challenge = (opponentId: string, username: string) =>
    call(
      '/api/h2h',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opponentId, leagueId, week, season }),
      },
      opponentId,
      `Challenge sent to ${username}.`,
    );

  const respond = (challengeId: string, action: 'accept' | 'decline' | 'cancel') =>
    call(
      '/api/h2h',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, action }),
      },
      challengeId,
      action === 'accept' ? "You're on." : action === 'decline' ? 'Declined.' : 'Withdrawn.',
    );

  const open = challenges.filter((c) => c.status === 'pending' || c.status === 'accepted');
  const done = challenges.filter((c) => c.status === 'completed');
  const alreadyFacing = new Set(open.map((c) => c.opponentName));

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

      {open.length > 0 && (
        <section className="px-4">
          <h2 className="pb-2 eyebrow">
            This week
          </h2>
          <div className="space-y-2">
            {open.map((c) => (
              <div key={c.id} className="card px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">
                      {c.iAmChallenger ? 'You' : c.opponentName} v{' '}
                      {c.iAmChallenger ? c.opponentName : 'you'}
                    </div>
                    <div className="text-[11px] text-muted">
                      Week {c.week} · {c.status === 'pending' ? 'awaiting reply' : 'live'}
                    </div>
                  </div>

                  {c.status === 'pending' && !c.iAmChallenger && (
                    <span className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={busy === c.id}
                        onClick={() => respond(c.id, 'accept')}
                        className="btn-primary h-8 px-3 text-xs"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={busy === c.id}
                        onClick={() => respond(c.id, 'decline')}
                        className="btn-ghost h-8 px-3 text-xs"
                      >
                        No
                      </button>
                    </span>
                  )}

                  {c.status === 'pending' && c.iAmChallenger && (
                    <button
                      type="button"
                      disabled={busy === c.id}
                      onClick={() => respond(c.id, 'cancel')}
                      className="btn-ghost h-8 px-3 text-xs"
                    >
                      Withdraw
                    </button>
                  )}

                  {c.status === 'accepted' && (
                    <span className="rounded-lg bg-brand/15 px-2.5 py-1 text-[11px] font-bold text-brand">
                      ON
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-5 px-4">
        <h2 className="pb-2 eyebrow">
          Call someone out
        </h2>
        {mates.length === 0 ? (
          <p className="text-sm text-muted">
            Nobody else in this league yet. Share your invite code.
          </p>
        ) : (
          <div className="space-y-2">
            {mates.map((mate) => (
              <div key={mate.userId} className="card flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">{mate.username}</div>
                  {mate.record && <div className="text-[11px] text-muted">{mate.record} v you</div>}
                </div>
                <button
                  type="button"
                  disabled={busy === mate.userId || alreadyFacing.has(mate.username)}
                  onClick={() => challenge(mate.userId, mate.username)}
                  className="btn-ghost h-8 px-3 text-xs disabled:opacity-40"
                >
                  {alreadyFacing.has(mate.username) ? 'On' : 'Challenge'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {done.length > 0 && (
        <section className="mt-5 px-4">
          <h2 className="pb-2 eyebrow">
            Settled
          </h2>
          <div className="space-y-2">
            {done.map((c) => {
              const myScore = c.iAmChallenger ? c.challengerScore : c.opponentScore;
              const theirScore = c.iAmChallenger ? c.opponentScore : c.challengerScore;
              const won = c.winnerId === c.myId;
              const tied = c.winnerId === null;

              return (
                <div key={c.id} className="card flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold">{c.opponentName}</div>
                    <div className="text-[11px] text-muted">Week {c.week}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabnum text-sm">
                      {Math.round(myScore ?? 0)} – {Math.round(theirScore ?? 0)}
                    </span>
                    <span
                      className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                        tied ? 'bg-push/20 text-push' : won ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'
                      }`}
                    >
                      {tied ? 'TIE' : won ? 'WON' : 'LOST'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
