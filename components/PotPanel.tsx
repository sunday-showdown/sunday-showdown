'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface PotMember {
  userId: string;
  username: string;
  paid: boolean;
}

interface Props {
  potId: string | null;
  leagueId: string;
  season: number;
  buyIn: number;
  confirmed: number;
  projected: number;
  members: readonly PotMember[];
  isOwner: boolean;
}

export default function PotPanel({
  potId,
  leagueId,
  season,
  buyIn,
  confirmed,
  projected,
  members,
  isOwner,
}: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState('20');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const post = async (payload: Record<string, unknown>, key: string) => {
    setBusy(key);
    setError('');
    try {
      const response = await fetch('/api/pot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result?.error ?? 'That did not work.');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error.');
    } finally {
      setBusy(null);
    }
  };

  if (!potId) {
    return (
      <section className="px-4">
        <div className="card p-5">
          <h2 className="display text-[19px] leading-none">Track a pot</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            A shared ledger of who has paid in. The app never handles money —
            it just means nobody has to keep the list in their head.
          </p>

          <label htmlFor="buyin" className="mt-4 mb-1.5 block text-sm font-medium">
            Buy-in per person
          </label>
          <input
            id="buyin"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            className="field"
          />

          {error && <p role="alert" className="mt-3 rounded-xl bg-loss/15 px-4 py-3 text-sm text-loss">{error}</p>}

          <button
            type="button"
            disabled={busy !== null}
            onClick={() => post({ action: 'create', leagueId, season, buyIn: Number(amount) }, 'create')}
            className="btn-primary mt-4 h-11 w-full text-sm"
          >
            Start the pot
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="px-4">
        <div className="card grid grid-cols-3 divide-x divide-line">
          <Figure label="Buy-in" value={`$${buyIn}`} />
          <Figure label="Collected" value={`$${confirmed}`} tone="text-win" />
          <Figure label="Projected" value={`$${projected}`} />
        </div>
      </section>

      {error && <p role="alert" className="mx-4 mt-3 rounded-xl bg-loss/15 px-4 py-3 text-sm text-loss">{error}</p>}

      <section className="mt-4 px-4">
        <h2 className="pb-2 eyebrow">
          Who&apos;s paid
        </h2>
        <div className="space-y-2">
          {members.map((member) => (
            <div key={member.userId} className="card flex items-center justify-between px-4 py-3">
              <span className="text-sm font-semibold">{member.username}</span>
              {isOwner ? (
                <button
                  type="button"
                  disabled={busy === member.userId}
                  onClick={() =>
                    post(
                      { action: 'setPaid', potId, targetUserId: member.userId, paid: !member.paid },
                      member.userId,
                    )
                  }
                  className={`h-8 rounded-lg px-3 text-xs font-bold transition-colors ${
                    member.paid ? 'bg-win/15 text-win' : 'bg-raised text-muted'
                  }`}
                >
                  {member.paid ? 'PAID' : 'MARK PAID'}
                </button>
              ) : (
                <span
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                    member.paid ? 'bg-win/15 text-win' : 'bg-raised text-muted'
                  }`}
                >
                  {member.paid ? 'PAID' : 'OWES'}
                </span>
              )}
            </div>
          ))}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Every change is recorded with who made it and when, so there is a trail
          if anyone disagrees later.
        </p>
      </section>
    </>
  );
}

function Figure({ label, value, tone = 'text-ink' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-2 py-3 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={`display mt-0.5 text-[19px] leading-none tabnum ${tone}`}>{value}</div>
    </div>
  );
}
