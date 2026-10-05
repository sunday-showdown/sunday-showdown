'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/home';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      // Deliberately vague: saying which half was wrong tells an attacker
      // whether an address has an account.
      setError('That email and password combination did not work.');
      setBusy(false);
      return;
    }

    // Full navigation so middleware re-runs and server components see the
    // new session.
    router.refresh();
    router.replace(next);
  };

  return (
    <div className="pt-10">
        <h1 className="display text-[32px] leading-none">Welcome back</h1>
        <p className="mt-2 text-sm text-muted">Sign in to make this week&apos;s picks.</p>

        <form onSubmit={signIn} className="mt-8 space-y-3">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-loss/10 px-4 py-3 text-sm text-loss">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary !mt-5 h-12 w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm">
          <Link href="/reset-password" className="text-muted hover:text-ink">
            Forgot password?
          </Link>
        <Link href="/signup" className="font-semibold text-brand">
          Create account
        </Link>
      </div>
    </div>
  );
}
