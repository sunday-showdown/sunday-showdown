'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ProviderInfo } from '@/lib/auth-providers';

/**
 * Sign in with Apple or Google.
 *
 * The reason this matters more than it looks: an invited friend currently has
 * to type an email, invent a password and then go and find a confirmation
 * email before they see a single game. Most people do not finish that, and an
 * app for friend groups only works if one person can get five friends in
 * quickly. This is one tap and no confirmation.
 *
 * The redirect lands on /auth/callback, which already exchanges a code for a
 * session — the same route email confirmation uses.
 */
export default function OAuthButtons({
  providers,
  next = '/home',
}: {
  providers: readonly ProviderInfo[];
  next?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (providers.length === 0) return null;

  const start = async (provider: ProviderInfo) => {
    setBusy(provider.id);
    setError('');

    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: provider.id,
        options: {
          // Built from the live origin so it is correct on localhost, on a
          // preview and in production without a variable to keep in step.
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });

      if (oauthError) {
        setError(`Could not reach ${provider.label}. Try the email form below.`);
        setBusy(null);
      }
      // On success the browser is already navigating away.
    } catch {
      setError('Something went wrong starting that sign-in.');
      setBusy(null);
    }
  };

  return (
    <div className="mt-7">
      <div className="space-y-2">
        {providers.map((provider) => (
          <button
            key={provider.id}
            type="button"
            onClick={() => void start(provider)}
            disabled={busy !== null}
            className="btn-ghost h-12 w-full gap-2.5 text-sm"
          >
            {provider.id === 'apple' ? <AppleMark /> : <GoogleMark />}
            {busy === provider.id ? 'Opening…' : `Continue with ${provider.label}`}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-2.5 text-center text-[12px] text-loss">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}

function AppleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.37 12.76c.02 2.5 2.19 3.33 2.21 3.34-.02.06-.35 1.2-1.15 2.37-.69 1.02-1.4 2.03-2.53 2.05-1.11.02-1.47-.66-2.74-.66s-1.66.64-2.72.68c-1.09.04-1.92-1.1-2.62-2.11-1.42-2.07-2.51-5.84-1.05-8.39.73-1.26 2.03-2.06 3.44-2.08 1.07-.02 2.08.72 2.74.72.65 0 1.88-.89 3.17-.76.54.02 2.06.22 3.04 1.65-.08.05-1.81 1.06-1.79 3.19M14.3 5.1c.58-.71.98-1.69.87-2.67-.84.03-1.86.56-2.46 1.26-.54.63-1.01 1.63-.88 2.59.94.07 1.89-.47 2.47-1.18" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.86-.08-1.68-.22-2.48H12v4.7h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.56-5.15 3.56-8.84z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.23 0 5.94-1.07 7.92-2.9l-3.86-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.76-2.1-6.7-4.94H1.3v3.1A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.3 14.31a7.2 7.2 0 0 1 0-4.61v-3.1H1.3a12 12 0 0 0 0 10.81z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.3 6.6l4 3.1C6.24 6.86 8.88 4.75 12 4.75z"
      />
    </svg>
  );
}
