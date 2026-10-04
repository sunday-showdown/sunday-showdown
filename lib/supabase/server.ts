// Request-scoped Supabase client for server components and route handlers.
//
// Acts as the signed-in user, so every query is subject to RLS. Jobs that must
// bypass RLS use createAdminClient from ./admin instead.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

function requireEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set');
  }
  return { url, anonKey };
}

export async function createServerSupabase(): Promise<SupabaseClient> {
  const { url, anonKey } = requireEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server components cannot set cookies. Session refresh happens in
          // middleware, so there is nothing to recover here.
        }
      },
    },
  });
}

export interface SessionUser {
  id: string;
  email: string | null;
}

/** The signed-in user, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * The signed-in user, or throw.
 *
 * For route handlers that have already been past middleware and genuinely
 * cannot proceed without an identity.
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super('authentication required');
    this.name = 'UnauthorizedError';
  }
}
