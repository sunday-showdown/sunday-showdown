'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatKickoff } from '@/lib/format';

export interface SurvivorGameOption {
  gameId: string;
  teamAbbr: string;
  teamLogo: string | null;
  opponentAbbr: string;
  isHome: boolean;
  kickoff: string;
  started: boolean;
}

interface Props {
  poolId: string;
  week: number;
  options: readonly SurvivorGameOption[];
  usedTeams: readonly string[];
  currentPick: string | null;
  alive: boolean;
  locked: boolean;
}

export default function SurvivorBoard({
  poolId,
  week,
  options,
  usedTeams,
  currentPick,
  alive,
  locked,
}: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const used = new Set(usedTeams);

  const pick = async (teamAbbr: string) => {
    setSaving(teamAbbr);
    setMessage(null);

    try {
      const response = await fetch('/api/survivor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolId, week, teamAbbr }),
      });
      const result = await response.json();

      if (!response.ok) {
        setMessage({ tone: 'error', text: result?.error ?? 'Could not save that pick.' });
        return;
      }

      setMessage({ tone: 'ok', text: `${teamAbbr} locked in for week ${week}.` });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: 'Network error. Your pick was not saved.' });
    } finally {
      setSaving(null);
    }
  };

  if (!alive) {
    return (
      <div className="card mx-4 p-6 text-center">
        <div className="display text-[22px] leading-none">You&apos;re out</div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Knocked out of this pool. You can still watch it play out — and there
          is always next season.
        </p>
      </div>
    );
  }

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

      <div className="grid grid-cols-2 gap-2 px-4">
        {options.map((option) => {
          const isUsed = used.has(option.teamAbbr) && option.teamAbbr !== currentPick;
          const isCurrent = option.teamAbbr === currentPick;
          const disabled = isUsed || option.started || locked || saving !== null;

          return (
            <button
              key={option.teamAbbr}
              type="button"
              disabled={disabled}
              aria-pressed={isCurrent}
              onClick={() => pick(option.teamAbbr)}
              className={`card flex flex-col items-start gap-1 px-3 py-3 text-left transition-colors ${
                isCurrent
                  ? 'border-brand bg-brand/10'
                  : disabled
                    ? 'opacity-40'
                    : 'active:bg-raised'
              }`}
            >
              <span className="flex items-center gap-2">
                {option.teamLogo && (
                  // eslint-disable-next-line @next/next/no-img-element -- ESPN CDN, already sized.
                  <img src={option.teamLogo} alt="" width={22} height={22} className="h-5.5 w-5.5 object-contain" />
                )}
                <span className="display text-[17px] leading-none">{option.teamAbbr}</span>
                {isCurrent && <span className="text-[10px] font-bold text-brand">PICKED</span>}
              </span>
              <span className="text-[11px] text-muted">
                {option.isHome ? 'vs' : '@'} {option.opponentAbbr}
              </span>
              <span className="text-[10px] text-muted">
                {isUsed ? 'Already used' : option.started ? 'Kicked off' : formatKickoff(option.kickoff)}
              </span>
            </button>
          );
        })}
      </div>

      {used.size > 0 && (
        <p className="mt-4 px-5 text-[11px] leading-relaxed text-muted">
          Used so far: {[...used].sort().join(', ')}
        </p>
      )}
    </>
  );
}
