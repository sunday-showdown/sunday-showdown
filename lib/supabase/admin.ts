// Service-role client for sync and grading jobs.
//
// This key bypasses RLS, so it must never reach the browser. Importing this
// module from a client component is a bug; everything here is server-only.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for admin operations',
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/**
 * Constant-time-ish check that a cron request carries the shared secret.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without this, anyone
 * who discovered the route could trigger a sync or a grading run.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
