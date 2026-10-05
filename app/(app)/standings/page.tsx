import { redirect } from 'next/navigation';

// The season table lives at /ranks now, where it is one of four boards rather
// than the only one. This keeps an old link or a home-screen shortcut working.
export default function StandingsRedirect() {
  redirect('/ranks');
}
