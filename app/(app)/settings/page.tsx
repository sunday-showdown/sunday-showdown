import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import AppBar from '@/components/AppBar';
import PushToggle from '@/components/PushToggle';
import SettingsPanel, { type NotificationPrefs } from '@/components/SettingsPanel';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

/** Every notification is on until somebody says otherwise. */
const DEFAULTS: NotificationPrefs = {
  deadline_approaching: true,
  picks_locked: true,
  game_final: true,
  first_place: true,
  passed_in_standings: true,
  td_scored: true,
  weekly_results: true,
  achievements: true,
};

export default async function SettingsPage() {
  const user = (await getSessionUser())!;
  const supabase = await createServerSupabase();

  const [{ data: profile }, { data: prefs }] = await Promise.all([
    supabase
      .from('profiles')
      .select('username, preferred_books')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  // No row means defaults, which is what they have been getting all along.
  const merged: NotificationPrefs = { ...DEFAULTS };
  if (prefs) {
    for (const key of Object.keys(DEFAULTS) as (keyof NotificationPrefs)[]) {
      if (typeof prefs[key] === 'boolean') merged[key] = prefs[key] as boolean;
    }
  }

  return (
    <main className="pb-8">
      <AppBar title="Settings" back="/profile" />

      <section className="px-4 pb-5">
        <PushToggle publicKey={process.env.VAPID_PUBLIC_KEY ?? null} />
      </section>

      <SettingsPanel
        username={(profile?.username as string) ?? ''}
        preferredBooks={(profile?.preferred_books as string[]) ?? []}
        prefs={merged}
      />
    </main>
  );
}
