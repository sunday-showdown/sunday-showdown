'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinLeaguePage() {
  const router = useRouter();
  const [code, setCode] = useState('');
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
    router.replace('/picks');
  };

  return (
    <main className="px-5 pt-6 safe-top">
      <h1 className="font-display text-2xl font-extrabold tracking-tight">Join a league</h1>
      <p className="mt-2 text-sm text-muted">
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
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            maxLength={10}
            className="field text-center font-display text-2xl font-extrabold tracking-[0.3em]"
            placeholder="ABC234"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-loss/10 px-4 py-3 text-sm text-loss">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || code.length < 6}
          className="btn-primary !mt-5 h-12 w-full text-sm"
        >
          {busy ? 'Joining…' : 'Join league'}
        </button>
      </form>
    </main>
  );
}
