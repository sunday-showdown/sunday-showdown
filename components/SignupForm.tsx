'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import OAuthButtons from './OAuthButtons';
import type { ProviderInfo } from '@/lib/auth-providers';

// Mirrors the username_format check constraint on profiles. Validating here
// gives a usable message instead of a database error.
const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;

export default function SignupForm({ providers = [] }: { providers?: readonly ProviderInfo[] }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const signUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!USERNAME_RE.test(username)) {
      setError('Usernames are 3–24 characters, letters, numbers and underscores only.');
      return;
    }
    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }

    setBusy(true);
    const supabase = createClient();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });

    if (signUpError) {
      setError(signUpError.message);
      setBusy(false);
      return;
    }

    // The profile is created by the on_auth_user_created trigger, which also
    // resolves a username collision rather than failing the signup. Nothing to
    // insert from here.
    if (!data.session) {
      setNotice('Check your email to confirm your account, then sign in.');
      setBusy(false);
      return;
    }

    router.refresh();
    router.replace('/home');
  };

  return (
      <div className="pt-8">
        <h1 className="display text-[32px] leading-none">Get started</h1>
        <p className="mt-2 text-sm text-muted">
          Pick a name your friends will recognise on the leaderboard.
        </p>

        <OAuthButtons providers={providers} />

        <form onSubmit={signUp} className="mt-6 space-y-3">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium">
              Username
            </label>
            <input
              id="username"
              autoComplete="username"
              autoCapitalize="none"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="field"
              placeholder="bigplaybrian"
            />
          </div>

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
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
              placeholder="At least 8 characters"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-loss/10 px-4 py-3 text-sm text-loss">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="rounded-xl bg-brand/10 px-4 py-3 text-sm text-brand">
              {notice}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary !mt-5 h-12 w-full">
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-brand">
            Sign in
          </Link>
        </p>
      </div>
  );
}
