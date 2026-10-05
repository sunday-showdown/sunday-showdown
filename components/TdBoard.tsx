'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatOdds } from '@/lib/format';

export interface TdCandidate {
  playerId: string;
  name: string;
  teamAbbr: string;
  opponentAbbr: string;
  position: string;
  headshotUrl: string | null;
  points: number;
  americanOdds: number | null;
  band: string;
}

interface Props {
  challengeId: string;
  candidates: readonly TdCandidate[];
  myPicks: readonly { playerId: string; points: number; result: string }[];
  locked: boolean;
}

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE'] as const;

export default function TdBoard({ challengeId, candidates, myPicks, locked }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>('ALL');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const picked = new Map(myPicks.map((p) => [p.playerId, p]));

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates
      .filter((c) => (position === 'ALL' ? true : c.position === position))
      .filter((c) => (needle ? c.name.toLowerCase().includes(needle) : true))
      // Cheapest first: the players most likely to score lead the board, and
      // anyone hunting a long shot can scroll or filter.
      .sort((a, b) => a.points - b.points || a.name.localeCompare(b.name))
      .slice(0, 120);
  }, [candidates, query, position]);

  const act = async (candidate: TdCandidate, clear: boolean) => {
    setBusy(candidate.playerId);
    setMessage(null);
    try {
      const response = await fetch('/api/td', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, playerId: candidate.playerId, clear }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage({ tone: 'error', text: result?.error ?? 'That did not work.' });
        return;
      }
      setMessage({
        tone: 'ok',
        text: clear ? `${candidate.name} removed.` : `${candidate.name} added for +${candidate.points}.`,
      });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: 'Network error.' });
    } finally {
      setBusy(null);
    }
  };

  const staked = myPicks.reduce((sum, p) => sum + p.points, 0);

  return (
    <>
      <div className="sticky top-0 z-30 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Picked</div>
            <div className="display text-[22px] leading-none tabnum">{myPicks.length}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">On the line</div>
            <div className="display text-[22px] leading-none tabnum text-brand">+{staked}</div>
          </div>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a player"
          aria-label="Search a player"
          className="field mt-3 !min-h-10"
        />

        <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
          {POSITIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPosition(p)}
              aria-pressed={position === p}
              className={`h-7 shrink-0 rounded-lg px-3 text-xs font-bold transition-colors ${
                position === p ? 'bg-brand text-brand-ink' : 'bg-raised text-muted'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`mx-4 mt-3 rounded-xl px-4 py-3 text-sm ${
            message.tone === 'error' ? 'bg-loss/15 text-loss' : 'bg-brand/15 text-brand'
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-3 space-y-2 px-4">
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No players match that.</p>
        ) : (
          visible.map((candidate) => {
            const mine = picked.get(candidate.playerId);
            return (
              <div
                key={candidate.playerId}
                className={`card flex items-center gap-3 px-3 py-2.5 ${mine ? 'border-brand/50' : ''}`}
              >
                {candidate.headshotUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- ESPN CDN headshot.
                  <img
                    src={candidate.headshotUrl}
                    alt=""
                    width={36}
                    height={36}
                    className="h-9 w-9 shrink-0 rounded-full bg-raised object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised text-[10px] font-bold">
                    {candidate.position}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{candidate.name}</div>
                  <div className="text-[11px] text-muted">
                    {candidate.position} · {candidate.teamAbbr} v {candidate.opponentAbbr}
                    {candidate.americanOdds !== null && ` · ${formatOdds(candidate.americanOdds)}`}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={locked || busy === candidate.playerId}
                  onClick={() => act(candidate, Boolean(mine))}
                  className={`flex h-9 shrink-0 items-center gap-1 rounded-xl px-3 text-sm font-bold transition-colors ${
                    mine
                      ? 'bg-brand text-brand-ink'
                      : 'border border-line bg-raised text-brand disabled:opacity-40'
                  }`}
                >
                  {mine ? '✓' : '+'}
                  {candidate.points}
                </button>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
