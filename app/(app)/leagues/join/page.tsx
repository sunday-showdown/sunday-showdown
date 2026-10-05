'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function JoinLeaguePage() {
  return (
    <Suspense fallback={<main className="px-5 pt-6" />}>
      <JoinForm />
    </Suspense>
  );
}

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  // A shared invite link carries the code, so the field is already filled.
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const join = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');

    const response = await fetch('/api/leagues', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode: code }),
    });
    const result = await response.json();

    if (!response.ok) {
      setError(result?.error ?? 'Could not join that league.');
      setBusy(false);
      return;
    }

    router.refresh();
    router.replace(`/leagues/${result.leagueId}`);
  };

  return (
    <main className="px-5 pt-6">
      <h1 className="display text-[30px] leading-none">Join a league</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Ask whoever set it up for the six-character code.
      </p>

      <form onSubmit={join} className="mt-7 space-y-3">
        <div>
          <label htmlFor="code" className="mb-1.5 block text-sm font-medium">
            Invite code
          </label>
          <input
            id="code"
            required
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            maxLength={10}
            className="field display text-center text-[32px] tracking-[0.3em]"
            placeholder="ABC234"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-loss/15 px-4 py-3 text-sm text-loss">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || code.length < 6}
          className="btn-primary !mt-5 w-full text-[15px]"
        >
          {busy ? 'Joining…' : 'Join league'}
        </button>
      </form>
    </main>
  );
}
