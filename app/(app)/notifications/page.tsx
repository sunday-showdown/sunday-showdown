import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import NotificationList, { type Note } from '@/components/NotificationList';
import EmptyState from '@/components/EmptyState';
import PushToggle from '@/components/PushToggle';
import AppBar from '@/components/AppBar';

export const metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

/**
 * The destination a notification carries, if it is a safe one.
 *
 * `data` is JSON written by the builders in lib/notifications.ts, but it is read
 * back as arbitrary JSON — so only an in-app path is accepted. A stored absolute
 * URL would turn the bell into an open redirect.
 */
function urlOf(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const url = (data as { url?: unknown }).url;
  if (typeof url !== 'string') return null;
  return url.startsWith('/') && !url.startsWith('//') ? url : null;
}

export default async function NotificationsPage() {
  const user = (await getSessionUser())!;
  const supabase = await createServerSupabase();

  const { data } = await supabase
    .from('notifications')
    .select('id, type, title, message, is_read, created_at, data')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(60);

  const notes: Note[] = (data ?? []).map((n) => ({
    id: n.id as string,
    type: n.type as string,
    title: n.title as string,
    message: (n.message as string) ?? '',
    isRead: Boolean(n.is_read),
    createdAt: n.created_at as string,
    url: urlOf(n.data),
  }));

  return (
    <main className="pb-4">
      <AppBar title="Notifications" back="/home" />

      <section className="px-4 pb-4">
        <PushToggle publicKey={process.env.VAPID_PUBLIC_KEY ?? null} />
      </section>

      {notes.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          body="Results, lock reminders and challenges land here."
        />
      ) : (
        <NotificationList notes={notes} />
      )}
    </main>
  );
}
