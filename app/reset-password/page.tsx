'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const request = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);

    await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/profile`,
    });

    // Always reports success: saying whether an address exists would let
    // anyone enumerate accounts.
    setSent(true);
    setBusy(false);
  };

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 safe-top">
      <header className="py-3">
        <Link href="/" className="font-display text-lg font-extrabold tracking-tight">
          Sunday<span className="text-brand">Showdown</span>
        </Link>
      </header>

      <div className="pt-10">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Reset password</h1>

        {sent ? (
          <p className="mt-4 rounded-xl bg-brand/10 px-4 py-4 text-sm leading-relaxed text-brand">
            If an account exists for {email}, a reset link is on its way. Check
            your spam folder if it doesn&apos;t arrive in a minute.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              We&apos;ll email you a link to set a new one.
            </p>
            <form onSubmit={request} className="mt-8 space-y-3">
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
              <button type="submit" disabled={busy} className="btn-primary !mt-5 h-12 w-full">
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-muted hover:text-ink">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
