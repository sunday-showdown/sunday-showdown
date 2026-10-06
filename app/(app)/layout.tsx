import { redirect } from 'next/navigation';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import BottomNav from '@/components/BottomNav';
import Onboarding from '@/components/Onboarding';

// Middleware already redirects anonymous requests; this is the second gate so a
// signed-out user can never reach a page that assumes a user exists.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  // Shown once per account, not once per device. Every account that existed
  // before the tour was written was backfilled as already onboarded in
  // migration 0029, so nobody gets walked around an app they have been using
  // for a month.
  const supabase = await createServerSupabase();
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarded_at')
    .eq('user_id', user.id)
    .maybeSingle();

  // No top padding and no notch scrim here any more. Both used to live in this
  // file, and between them they produced the clipped heading: the scrim was a
  // fixed translucent strip that page content slid under, and the padding left
  // every title pressed right up against the bottom of the notch. AppBar now
  // owns the inset as part of a real sticky surface. See components/AppBar.tsx.
  return (
    <>
      {/* pb-24 clears the fixed bottom nav plus the home indicator. */}
      <div className="mx-auto min-h-dvh max-w-md pb-24">{children}</div>
      <BottomNav />
      {profile && profile.onboarded_at === null && <Onboarding />}
    </>
  );
}
