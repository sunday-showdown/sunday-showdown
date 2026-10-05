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

const BAND_LABEL: Record<string, { label: string; className: string }> = {
  lock: { label: 'Likely', className: 'bg-win/15 text-win' },
  solid: { label: 'Live', className: 'bg-raised text-muted' },
  longshot: { label: 'Long shot', className: 'bg-brand/15 text-brand' },
};

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
        text: clear ? `${candidate.name} removed.` : `${candidate.name} in for ${candidate.points}.`,
      });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: 'Network error.' });
    } finally {
      setBusy(null);
    }
  };

  const staked = myPicks.reduce((sum, p) => sum + p.points, 0);
  const mine = candidates.filter((c) => picked.has(c.playerId));

  return (
    <>
      <div
        style={{ top: 'env(safe-area-inset-top)' }}
        className="sticky z-30 border-b border-line/70 bg-bg/90 px-4 py-2.5 backdrop-blur-xl"
      >
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
              Players in
            </span>
            <span className="display text-[22px] leading-[1.05] tabnum">{myPicks.length}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
              To win
            </span>
            <span className="display text-glow text-[22px] leading-[1.05] tabnum text-brand">
              {staked}
            </span>
          </div>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a player"
          aria-label="Search a player"
          autoCapitalize="none"
          autoCorrect="off"
          className="field mt-2.5 !min-h-11"
        />

        <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
          {POSITIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPosition(p)}
              aria-pressed={position === p}
              className={`display h-8 shrink-0 rounded-lg px-3.5 text-[12px] leading-none transition-colors ${
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

      {mine.length > 0 && query.trim() === '' && (
        <section className="mt-3 px-4">
          <h2 className="eyebrow pb-2">Your card</h2>
          <div className="space-y-2">
            {mine.map((candidate) => (
              <PlayerRow
                key={candidate.playerId}
                candidate={candidate}
                picked
                busy={busy === candidate.playerId}
                locked={locked}
                onAct={() => act(candidate, true)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-4 px-4">
        <h2 className="eyebrow pb-2">
          {position === 'ALL' ? 'All players' : position} · cheapest first
        </h2>

        <div className="space-y-2">
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No players match that.</p>
          ) : (
            visible.map((candidate) => (
              <PlayerRow
                key={candidate.playerId}
                candidate={candidate}
                picked={picked.has(candidate.playerId)}
                busy={busy === candidate.playerId}
                locked={locked}
                onAct={() => act(candidate, picked.has(candidate.playerId))}
              />
            ))
          )}
        </div>
      </section>
    </>
  );
}

function PlayerRow({
  candidate,
  picked,
  busy,
  locked,
  onAct,
}: {
  candidate: TdCandidate;
  picked: boolean;
  busy: boolean;
  locked: boolean;
  onAct: () => void;
}) {
  const band = BAND_LABEL[candidate.band] ?? BAND_LABEL.solid!;

  return (
    <div className={`card flex items-center gap-3 px-3 py-2.5 ${picked ? 'card-hot' : ''}`}>
      {candidate.headshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- ESPN CDN headshot.
        <img
          src={candidate.headshotUrl}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-full bg-raised object-cover"
        />
      ) : (
        <span className="display flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-raised text-[11px] text-muted">
          {candidate.position}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold leading-tight">{candidate.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
          <span className="font-semibold">{candidate.position}</span>
          <span>·</span>
          <span>
            {candidate.teamAbbr} v {candidate.opponentAbbr}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className={`chip ${band.className}`}>{band.label}</span>
          {candidate.americanOdds !== null && (
            <span className="text-[10px] font-semibold tabnum text-muted">
              {formatOdds(candidate.americanOdds)}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={locked || busy}
        onClick={onAct}
        aria-pressed={picked}
        aria-label={
          picked ? `Remove ${candidate.name}` : `Add ${candidate.name} for ${candidate.points} points`
        }
        className={`flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-xl text-[11px] font-bold transition-colors disabled:opacity-40 ${
          picked
            ? 'bg-brand text-brand-ink'
            : 'border border-line bg-raised text-brand active:bg-line/50'
        }`}
      >
        <span className="display text-[17px] leading-none">{candidate.points}</span>
        <span className={`text-[9px] leading-none ${picked ? 'text-brand-ink/75' : 'text-muted'}`}>
          {picked ? 'IN' : 'PTS'}
        </span>
      </button>
    </div>
  );
}
