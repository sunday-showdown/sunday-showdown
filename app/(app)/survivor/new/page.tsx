'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppBar from '@/components/AppBar';

export default function NewSurvivorPoolPage() {
  return (
    <Suspense fallback={<div />}>
      <NewPoolForm />
    </Suspense>
  );
}

function NewPoolForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState('');
  const [potEnabled, setPotEnabled] = useState(false);
  const [buyIn, setBuyIn] = useState('20');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');

    const response = await fetch('/api/survivor', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        leagueId: params.get('league'),
        season: Number(params.get('season')),
        buyIn: potEnabled ? Number(buyIn) : 0,
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      setError(result?.error ?? 'Could not create that pool.');
      setBusy(false);
      return;
    }

    router.refresh();
    router.replace(`/survivor?pool=${result.poolId}`);
  };

  return (
    <main>
      <AppBar title="Start a pool" back="/survivor" compact />
      <div className="px-5 pt-2">
      <h1 className="display text-[28px] leading-none">Start a pool</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Everyone picks one team a week to win. Get it wrong and you&apos;re out.
        You can never pick the same team twice, so spending a good one early
        costs you later.
      </p>

      <form onSubmit={create} className="mt-7 space-y-3">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
            Pool name
          </label>
          <input
            id="name"
            required
            minLength={3}
            maxLength={48}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field"
            placeholder="Last One Standing"
          />
        </div>

        {/* Optional on purpose. Most pools are played for nothing, and asking
            for a number up front implies otherwise. */}
        <div className="card px-4 py-3.5">
          <label className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[14px] font-bold">Play for a pot</span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">
                Everyone who joins is asked for a buy-in. You tick people off as
                they pay — the app never handles the money.
              </span>
            </span>
            <input
              type="checkbox"
              checked={potEnabled}
              onChange={(event) => setPotEnabled(event.target.checked)}
              className="h-6 w-6 shrink-0 accent-brand"
            />
          </label>

          {potEnabled && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm font-semibold text-muted">$</span>
              <input
                inputMode="decimal"
                value={buyIn}
                onChange={(event) => setBuyIn(event.target.value.replace(/[^0-9.]/g, ''))}
                aria-label="Buy-in per person"
                className="field tabnum flex-1"
              />
              <span className="text-[12px] text-muted">per person</span>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-loss/15 px-4 py-3 text-sm text-loss">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary !mt-5 h-12 w-full text-sm">
          {busy ? 'Creating…' : 'Create pool'}
        </button>
      </form>
      </div>
    </main>
  );
}
