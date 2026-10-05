import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import NotificationList, { type Note } from '@/components/NotificationList';
import EmptyState from '@/components/EmptyState';

export const metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = (await getSessionUser())!;
  const supabase = await createServerSupabase();

  const { data } = await supabase
    .from('notifications')
    .select('id, type, title, message, is_read, created_at')
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
  }));

  return (
    <main className="pb-4">
      <header className="px-4 pb-3 pt-3">
        <h1 className="display text-[28px] leading-none">Notifications</h1>
      </header>

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
