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
      {/* The status bar is translucent and viewport-fit is cover, so the webview
          extends under the notch. Every screen gets that inset here rather than
          each page remembering to — forgetting it once cut the heading in half. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 bg-bg/80 backdrop-blur-sm"
        style={{ height: 'env(safe-area-inset-top)' }}
      />

      {/* pb-16 clears the fixed bottom nav plus the home indicator. */}
      <div
        className="mx-auto max-w-md pb-16"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {children}
      </div>

      <BottomNav />
    </>
  );
}
