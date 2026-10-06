// Which social sign-ins are switched on.
//
// Read from Supabase rather than hard-coded, because enabling Apple or Google
// happens in their dashboard and not in this repository. A button for a
// provider that is not configured sends people to a Supabase error page, so
// the buttons appear only once the provider actually works — which also means
// nothing here needs changing when you turn one on.
//
// GoTrue publishes this at /auth/v1/settings. It is public information (it is
// what the client library reads), so the anon key is the right credential.

export type Provider = 'google' | 'apple';

export interface ProviderInfo {
  id: Provider;
  label: string;
}

const KNOWN: ProviderInfo[] = [
  { id: 'apple', label: 'Apple' },
  { id: 'google', label: 'Google' },
];

/**
 * The providers that are enabled, in the order they should be shown.
 *
 * Returns an empty list on any failure. Social sign-in is an addition to the
 * email form, never a replacement, so a settings endpoint that is slow or down
 * must not take the login page with it.
 */
export async function enabledProviders(): Promise<ProviderInfo[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return [];

  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      // Enabling a provider is rare; re-asking on every page load is not worth
      // a round trip on the critical path.
      next: { revalidate: 300 },
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as { external?: Record<string, unknown> };
    const external = payload.external ?? {};

    return KNOWN.filter((provider) => external[provider.id] === true);
  } catch {
    return [];
  }
}
