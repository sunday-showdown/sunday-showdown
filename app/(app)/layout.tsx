import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import BottomNav from '@/components/BottomNav';

// Middleware already redirects anonymous requests; this is the second gate so a
// signed-out user can never reach a page that assumes a user exists.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');

  return (
    <>
      {/* pb-14 clears the fixed bottom nav. */}
      <div className="mx-auto max-w-md pb-14">{children}</div>
      <BottomNav />
    </>
  );
}
