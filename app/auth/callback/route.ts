// Exchanges an email link's code for a session.
//
// Used by email confirmation and password reset. Supabase sends the user here
// with a `code`; without this exchange the link lands on a page with no session.

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/home';

  // Only relative paths: an absolute `next` would make this an open redirect.
  const destination = next.startsWith('/') && !next.startsWith('//') ? next : '/home';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url.origin));
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/login?error=invalid_link', url.origin));
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}
