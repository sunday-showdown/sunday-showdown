// The name of the cookie that remembers which league you are looking at.
//
// Its own module because both sides need it: the server reads it through
// next/headers, the switcher writes it with document.cookie. Keeping it in
// lib/league.ts meant a client component importing the name also imported
// next/headers, which fails the build.
export const LEAGUE_COOKIE = 'ss_league';
