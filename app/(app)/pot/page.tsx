import { redirect } from 'next/navigation';

// The pot used to live here, as a screen of its own. It is now part of each
// mode — a pick'em pot on the pick'em screen, a survivor pot on survivor — so
// this exists only so an old link or a saved home-screen shortcut lands
// somewhere sensible instead of on a 404.
export default function PotRedirect() {
  redirect('/picks');
}
