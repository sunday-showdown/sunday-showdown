import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import BottomNav from '@/components/BottomNav';

// Middleware already redirects anonymous requests; this is the second gate so a
// signed-out user can never reach a page that assumes a user exists.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

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
    </>
  );
}
