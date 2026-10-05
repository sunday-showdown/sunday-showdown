'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function NewSurvivorPoolPage() {
  return (
    <Suspense fallback={<div className="px-5 pt-6" />}>
      <NewPoolForm />
    </Suspense>
  );
}

function NewPoolForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState('');
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
    <main className="px-5 pt-6">
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

        {error && (
          <p role="alert" className="rounded-xl bg-loss/15 px-4 py-3 text-sm text-loss">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary !mt-5 h-12 w-full text-sm">
          {busy ? 'Creating…' : 'Create pool'}
        </button>
      </form>
    </main>
  );
}
