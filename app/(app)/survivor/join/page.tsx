'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppBar from '@/components/AppBar';

export default function JoinPoolPage() {
  return (
    <Suspense fallback={<main />}>
      <JoinForm />
    </Suspense>
  );
}

/**
 * Redeem a pool invite.
 *
 * Opened either from a shared link, which fills the code in, or by hand from
 * somebody reading it out. A link with a code joins on arrival rather than
 * making the person press a button to confirm something they already chose by
 * tapping the link.
 */
function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const join = async (value: string) => {
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/survivor/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: value }),
      });
      const result = (await response.json()) as { error?: string; poolId?: string };

      if (!response.ok || !result.poolId) {
        setError(result.error ?? 'Could not join that pool.');
        return;
      }

      router.refresh();
      router.replace(`/survivor?pool=${result.poolId}`);
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  // A link carries the code, so the tap on the link is the confirmation.
  const fromLink = params.get('code');
  useEffect(() => {
    if (fromLink && /^[A-Za-z0-9]{6,10}$/.test(fromLink)) void join(fromLink);
    // Once, for the code the link arrived with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromLink]);

  return (
    <main>
      <AppBar title="Join a pool" back="/survivor" compact />
      <div className="px-5 pt-2">
        <h1 className="display text-[28px] leading-none">Join a pool</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Enter the six-character code whoever runs the pool gave you.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void join(code);
          }}
          className="mt-7 space-y-3"
        >
          <div>
            <label htmlFor="code" className="mb-1.5 block text-sm font-medium">
              Invite code
            </label>
            <input
              id="code"
              required
              value={code}
              onChange={(event) =>
                setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))
              }
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="field display text-center text-[24px] tracking-[0.3em]"
              placeholder="XXXXXX"
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
            className="btn-primary !mt-5 h-12 w-full text-sm"
          >
            {busy ? 'Joining…' : 'Join pool'}
          </button>
        </form>
      </div>
    </main>
  );
}
