// Refreshes the Supabase session on every request and gates private routes.
//
// Without this the access token expires mid-session and server components start
// seeing a signed-out user while the browser still thinks it is signed in.

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PREFIXES = ['/', '/login', '/signup', '/reset-password', '/join', '/about'];
const PUBLIC_FILE = /\.(svg|png|jpg|jpeg|webp|ico|json|txt|webmanifest|js)$/;

function isPublic(pathname: string): boolean {
  if (pathname.startsWith('/api/cron')) return true;
  if (pathname.startsWith('/auth/')) return true;
  if (PUBLIC_FILE.test(pathname)) return true;
  return PUBLIC_PREFIXES.includes(pathname);
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser, not getSession: it validates the token with Supabase rather than
  // trusting whatever the cookie claims.
  const { data } = await supabase.auth.getUser();

  if (!data.user && !isPublic(request.nextUrl.pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
