import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';

/** Unread count in the Home header. Server-rendered: no polling needed. */
export default async function NotificationBell() {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createServerSupabase();
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false);

  const unread = count ?? 0;

  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-raised"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6 9a6 6 0 1 1 12 0c0 3.5 1 5 1.5 5.5H4.5C5 14 6 12.5 6 9Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M10 18a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold tabnum text-brand-ink">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}
