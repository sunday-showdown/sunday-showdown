import Link from 'next/link';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadMyLeagues } from '@/lib/week';
import { formatRecord } from '@/lib/format';
import SignOutButton from '@/components/SignOutButton';
import AppBar from '@/components/AppBar';
import AchievementGrid, { type AchievementTile } from '@/components/AchievementGrid';
import AvatarUpload from '@/components/AvatarUpload';

export const metadata = { title: 'Profile' };

interface ProfileRow {
  username: string;
  avatar_url: string | null;
  favorite_team: string | null;
  career_pickem_wins: number;
  career_pickem_losses: number;
  career_pickem_pushes: number;
  career_ml_wins: number;
  career_ml_losses: number;
  career_spread_wins: number;
  career_spread_losses: number;
  career_total_wins: number;
  career_total_losses: number;
  current_pickem_streak: number;
  longest_pickem_streak: number;
  weekly_wins_count: number;
}

export default async function ProfilePage() {
  const user = (await getSessionUser())!;
  const supabase = await createServerSupabase();

  const [{ data: profile }, leagues] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'username, avatar_url, favorite_team, career_pickem_wins, career_pickem_losses, career_pickem_pushes, career_ml_wins, career_ml_losses, career_spread_wins, career_spread_losses, career_total_wins, career_total_losses, current_pickem_streak, longest_pickem_streak, weekly_wins_count',
      )
      .eq('user_id', user.id)
      .maybeSingle<ProfileRow>(),
    loadMyLeagues(supabase, user.id),
  ]);

  const [{ data: catalogue }, { data: mine }] = await Promise.all([
    supabase.from('achievements').select('id, name, description').order('sort_order'),
    supabase.from('user_achievements').select('achievement_id').eq('user_id', user.id),
  ]);

  const held = new Set((mine ?? []).map((a) => a.achievement_id as string));
  const tiles: AchievementTile[] = (catalogue ?? []).map((a) => ({
    id: a.id as string,
    name: a.name as string,
    description: a.description as string,
    earned: held.has(a.id as string),
  }));

  const graded =
    (profile?.career_pickem_wins ?? 0) +
    (profile?.career_pickem_losses ?? 0) +
    (profile?.career_pickem_pushes ?? 0);

  const hitRate =
    graded > 0 ? Math.round(((profile?.career_pickem_wins ?? 0) / graded) * 100) : null;

  return (
    <main className="pb-4">
      <AppBar title={profile?.username ?? 'Your profile'} subtitle={user.email} />

      <AvatarUpload
        username={profile?.username ?? 'you'}
        avatarUrl={profile?.avatar_url ?? null}
      />

      <section className="px-4 pb-2">
        <Link href="/bets" className="card flex items-center gap-3 px-4 py-3 active:bg-raised">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-win/15 text-[16px]"
          >
            📊
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
              Sportsbook record
            </div>
            <div className="mt-0.5 text-[13.5px] font-bold">Units, ROI and your real record</div>
          </div>
          <span className="shrink-0 text-muted">›</span>
        </Link>
      </section>

      <section className="px-4">
        <div className="card grid grid-cols-3 divide-x divide-line">
          <Stat
            label="Record"
            value={formatRecord(
              profile?.career_pickem_wins ?? 0,
              profile?.career_pickem_losses ?? 0,
              profile?.career_pickem_pushes ?? 0,
            )}
          />
          <Stat label="Hit rate" value={hitRate === null ? '—' : `${hitRate}%`} />
          <Stat label="Weeks won" value={String(profile?.weekly_wins_count ?? 0)} />
        </div>
      </section>

      <section className="mt-5">
        <h2 className="px-4 pb-2 eyebrow">
          By market
        </h2>
        <div className="space-y-2 px-4">
          <MarketRow
            label="Moneyline"
            wins={profile?.career_ml_wins ?? 0}
            losses={profile?.career_ml_losses ?? 0}
          />
          <MarketRow
            label="Spread"
            wins={profile?.career_spread_wins ?? 0}
            losses={profile?.career_spread_losses ?? 0}
          />
          <MarketRow
            label="Over / Under"
            wins={profile?.career_total_wins ?? 0}
            losses={profile?.career_total_losses ?? 0}
          />
        </div>
      </section>

      <section className="mt-5 px-4">
        <div className="card flex items-center justify-between px-4 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Current streak
            </div>
            <div className="display mt-0.5 text-[22px] leading-none tabnum">
              {profile?.current_pickem_streak ?? 0}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Best ever
            </div>
            <div className="display mt-0.5 text-[22px] leading-none tabnum text-brand">
              {profile?.longest_pickem_streak ?? 0}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5">
        <h2 className="px-4 pb-2 eyebrow">
          Your leagues
        </h2>
        <div className="space-y-2 px-4">
          {leagues.map((league) => (
            <Link
              key={league.id}
              href={`/leagues/`}
              className="card flex items-center justify-between px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{league.name}</div>
                <div className="text-[11px] text-muted">
                  {league.season}
                  {league.commissioner_id === user.id && (
                    <span className="text-brand"> · commissioner</span>
                  )}
                </div>
              </div>
              <span className="text-muted">›</span>
            </Link>
          ))}

          <div className="flex gap-2">
            <Link href="/leagues/new" className="btn-ghost flex-1 text-sm">
              New league
            </Link>
            <Link href="/leagues/join" className="btn-ghost flex-1 text-sm">
              Join one
            </Link>
          </div>
        </div>
      </section>

      {tiles.length > 0 && <AchievementGrid tiles={tiles} />}

      <section className="mt-8 px-4">
        <SignOutButton />
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-4 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="display mt-1 text-[19px] leading-none tabnum">{value}</div>
    </div>
  );
}

function MarketRow({
  label,
  wins,
  losses,
}: {
  label: string;
  wins: number;
  losses: number;
}) {
  const graded = wins + losses;
  const rate = graded > 0 ? Math.round((wins / graded) * 100) : null;

  return (
    <div className="card px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">
          {label}
        </span>
        <span className="text-sm tabnum text-muted">
          {formatRecord(wins, losses)}
          {rate !== null && <span className="ml-2 font-semibold text-ink">{rate}%</span>}
        </span>
      </div>
      {rate !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-brand" style={{ width: `${rate}%` }} />
        </div>
      )}
    </div>
  );
}
