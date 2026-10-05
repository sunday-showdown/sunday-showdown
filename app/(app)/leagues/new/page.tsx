'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewLeaguePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');

    const response = await fetch('/api/leagues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const result = await response.json();

    if (!response.ok) {
      setError(result?.error ?? 'Could not create that league.');
      setBusy(false);
      return;
    }

    setInviteCode(result.inviteCode);
    setBusy(false);
    router.refresh();
  };

  if (inviteCode) {
    return (
      <main className="px-5 pt-6">
        <h1 className="display text-[28px] leading-none">
          {name} is live
        </h1>
        <p className="mt-2 text-sm text-muted">
          Share this code with your friends. They enter it under &ldquo;Join with a code&rdquo;.
        </p>

        <div className="card mt-6 p-6 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Invite code
          </div>
          <div className="display mt-2 text-[42px] leading-none tracking-[0.2em]">
            {inviteCode}
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(inviteCode)}
          className="btn-ghost mt-3 h-11 w-full text-sm"
        >
          Copy code
        </button>
        <button
          type="button"
          onClick={() => router.push('/picks')}
          className="btn-primary mt-2 h-12 w-full text-sm"
        >
          Make your first picks
        </button>
      </main>
    );
  }

  return (
    <main className="px-5 pt-6">
      <h1 className="display text-[28px] leading-none">Create a league</h1>
      <p className="mt-2 text-sm text-muted">
        You&apos;ll be the commissioner. You can invite people straight after.
      </p>

      <form onSubmit={create} className="mt-7 space-y-3">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
            League name
          </label>
          <input
            id="name"
            required
            minLength={3}
            maxLength={48}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field"
            placeholder="The Sunday Crew"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-loss/10 px-4 py-3 text-sm text-loss">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary !mt-5 h-12 w-full text-sm">
          {busy ? 'Creating…' : 'Create league'}
        </button>
      </form>
    </main>
  );
}
