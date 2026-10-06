import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { formatRecord } from '@/lib/format';
import FollowButton from '@/components/FollowButton';
import AppBar from '@/components/AppBar';
import Avatar from '@/components/Avatar';
import MessageButton from '@/components/MessageButton';

export const metadata = { title: 'Player' };
export const dynamic = 'force-dynamic';

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const me = (await getSessionUser())!;
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'user_id, username, avatar_url, favorite_team, bio, career_pickem_wins, career_pickem_losses, career_pickem_pushes, career_ml_wins, career_spread_wins, career_total_wins, longest_pickem_streak, weekly_wins_count',
    )
    .eq('user_id', id)
    .maybeSingle();

  if (!profile) notFound();

  const [{ data: follow }, { data: results }, { data: badges }] = await Promise.all([
    supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', me.id)
      .eq('following_id', id)
      .maybeSingle(),
    supabase.from('weekly_results').select('total_points, is_winner').eq('user_id', id),
    supabase.from('user_achievements').select('achievement_id').eq('user_id', id),
  ]);

  const seasonPoints = (results ?? []).reduce((sum, r) => sum + Number(r.total_points), 0);
  const graded =
    Number(profile.career_pickem_wins) +
    Number(profile.career_pickem_losses) +
    Number(profile.career_pickem_pushes);
  const hitRate = graded > 0 ? Math.round((Number(profile.career_pickem_wins) / graded) * 100) : null;

  return (
    <main className="pb-6">
      <AppBar title={profile.username as string} back="back" compact />

      <header className="flex items-center gap-3 px-4 pb-3 pt-1">
        <Avatar
          username={profile.username as string}
          url={(profile.avatar_url as string) ?? null}
          size="xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="display truncate text-[26px] leading-none">{profile.username}</h1>
          <p className="truncate text-[11px] text-muted">
            {(profile.favorite_team as string) || 'Sunday Showdown'}
          </p>
        </div>
        {id !== me.id && (
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <FollowButton userId={id} initiallyFollowing={Boolean(follow)} />
            <MessageButton userId={id} />
          </div>
        )}
      </header>

      <section className="px-4">
        <div className="card grid grid-cols-3 divide-x divide-line">
          <Stat label="Season" value={String(Math.round(seasonPoints))} />
          <Stat
            label="Record"
            value={formatRecord(
              Number(profile.career_pickem_wins),
              Number(profile.career_pickem_losses),
              Number(profile.career_pickem_pushes),
            )}
          />
          <Stat label="Hit rate" value={hitRate === null ? '—' : `${hitRate}%`} />
        </div>
      </section>

      <section className="mt-4 px-4">
        <div className="card grid grid-cols-3 divide-x divide-line">
          <Stat label="Weeks won" value={String(profile.weekly_wins_count ?? 0)} />
          <Stat label="Best streak" value={String(profile.longest_pickem_streak ?? 0)} />
          <Stat label="Badges" value={String((badges ?? []).length)} />
        </div>
      </section>

      {profile.bio && (
        <section className="mt-4 px-4">
          <div className="card px-4 py-3 text-sm leading-relaxed text-muted">{profile.bio}</div>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-3.5 text-center">
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="display mt-1 text-[19px] leading-none tabnum">{value}</div>
    </div>
  );
}
