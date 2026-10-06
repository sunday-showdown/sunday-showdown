import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { loadMatchup, type MatchupPick, type MatchupSide } from '@/lib/duelDetail';
import { fighterRecord } from '@/lib/fighters';
import { MAX_HP, hpTone } from '@/lib/battle';
import { formatOdds } from '@/lib/format';
import AppBar from '@/components/AppBar';
import FighterArt from '@/components/FighterArt';
import RematchButton from '@/components/RematchButton';

export const metadata = { title: 'Matchup' };
export const dynamic = 'force-dynamic';

/**
 * One duel, in depth.
 *
 * The arena card on /h2h says who is winning. This says where it was won: both
 * cards, week by week, with the picks that separated them. It is the screen a
 * finished duel is actually for — the result on its own is a number, and the
 * argument afterwards is always about a specific pick.
 */
export default async function MatchupPage({ params }: { params: Promise<{ id: string }> }) {
  const user = (await getSessionUser())!;
  const { id } = await params;
  const supabase = await createServerSupabase();

  const duel = await loadMatchup(supabase, user.id, id);
  if (!duel) notFound();

  const iWon = duel.settled && duel.winnerId === duel.me.userId;
  const drew = duel.settled && duel.winnerId === null;

  return (
    <main className="pb-6">
      <AppBar
        title={duel.them.fighter.name}
        subtitle={
          duel.duration === 'season'
            ? `Season duel · ${duel.leagueName ?? 'friend duel'}`
            : `Week ${duel.week} · ${duel.leagueName ?? 'friend duel'}`
        }
        back="/h2h"
      />

      <section className="px-4">
        <div className={`card overflow-hidden p-4 ${duel.settled && iWon ? 'card-hot' : ''}`}>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <Corner side={duel.me} mine />
            <div className="pb-7 text-center">
              <div className="display text-[13px] leading-none text-muted">VS</div>
              {duel.knockoutWeek !== null && (
                <div className="display mt-1 text-[10px] leading-none text-brand">
                  KO wk {duel.knockoutWeek}
                </div>
              )}
            </div>
            <Corner side={duel.them} mine={false} />
          </div>

          <div className="mt-4 border-t border-line/70 pt-3 text-center">
            <div className="display text-[26px] leading-none">
              {duel.settled ? (drew ? 'Draw' : iWon ? 'You won' : 'You lost') : 'Still live'}
            </div>
            <p className="mt-1 text-[12px] text-muted">
              {duel.settled
                ? `${Math.round(duel.me.points)} to ${Math.round(duel.them.points)} across ${
                    duel.weeks.length
                  } week${duel.weeks.length === 1 ? '' : 's'}`
                : duel.duration === 'season'
                  ? 'Every week lands a blow until somebody drops.'
                  : 'Settles when the last game of the week is final.'}
            </p>
          </div>

          {duel.settled && (
            <div className="mt-3">
              <RematchButton opponentId={duel.them.userId} name={duel.them.username} />
            </div>
          )}
        </div>
      </section>

      {duel.weeks.map((week) => (
        <section key={week.week} className="mt-5">
          <div className="flex items-baseline justify-between px-4 pb-2">
            <h2 className="eyebrow">Week {week.week}</h2>
            <span
              className={`text-[11px] font-bold ${
                week.myDamage > 0 ? 'text-win' : week.theirDamage > 0 ? 'text-brand' : 'text-muted'
              }`}
            >
              {week.verdict}
            </span>
          </div>

          <div className="px-4">
            <div className="card flex items-center justify-around px-4 py-3">
              <Score label="You" value={Math.round(week.myPoints)} lead={week.myPoints >= week.theirPoints} />
              <span className="text-[11px] font-bold text-muted">—</span>
              <Score
                label={duel.them.username}
                value={Math.round(week.theirPoints)}
                lead={week.theirPoints >= week.myPoints}
              />
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 px-4">
            <Card title="Your card" picks={week.myPicks} hidden={false} />
            <Card title={`${duel.them.username}'s`} picks={week.theirPicks} hidden={week.theirsHidden} />
          </div>
        </section>
      ))}

      {duel.weeks.length === 0 && (
        <p className="mt-8 px-6 text-center text-sm text-muted">
          Nothing has been played yet. Come back once the week is under way.
        </p>
      )}

      <div className="mt-6 px-4">
        <Link href="/h2h" className="btn-ghost w-full text-sm">
          Back to the arena
        </Link>
      </div>
    </main>
  );
}

const TONE_BAR: Record<ReturnType<typeof hpTone>, string> = {
  healthy: 'bg-win',
  hurt: 'bg-gold',
  critical: 'bg-brand',
  down: 'bg-loss',
};

function Corner({ side, mine }: { side: MatchupSide; mine: boolean }) {
  return (
    <div className={mine ? 'text-left' : 'text-right'}>
      <div className={`flex ${mine ? '' : 'justify-end'}`}>
        <span style={{ transform: mine ? undefined : 'scaleX(-1)' }}>
          <FighterArt archetype={side.fighter.archetype} banner={side.fighter.banner} size={62} />
        </span>
      </div>
      <div className="mt-1.5 truncate text-[14px] font-bold">{side.fighter.name}</div>
      <Link
        href={`/u/${side.userId}`}
        className="block truncate text-[10px] font-bold uppercase tracking-[0.1em] text-muted"
      >
        {side.username} · {fighterRecord(side.fighter)}
      </Link>

      <div className={`mt-1.5 h-2 overflow-hidden rounded-full bg-raised ${mine ? '' : 'flex justify-end'}`}>
        <div
          className={`h-full rounded-full ${TONE_BAR[hpTone(side.hp)]}`}
          style={{ width: `${Math.max(0, Math.min(100, (side.hp / MAX_HP) * 100))}%` }}
        />
      </div>
      <div className="mt-1 display text-[15px] leading-none tabnum">{side.hp} HP</div>
    </div>
  );
}

function Score({ label, value, lead }: { label: string; value: number; lead: boolean }) {
  return (
    <div className="min-w-0 text-center">
      <div className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-muted">
        {label}
      </div>
      <div className={`display text-[26px] leading-none tabnum ${lead ? 'text-brand' : 'text-ink'}`}>
        {value}
      </div>
    </div>
  );
}

function Card({
  title,
  picks,
  hidden,
}: {
  title: string;
  picks: readonly MatchupPick[];
  hidden: boolean;
}) {
  return (
    <div className="card overflow-hidden px-3 py-2.5">
      <div className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-muted">
        {title}
      </div>

      {hidden ? (
        <p className="mt-2 text-[11px] leading-snug text-muted">
          Hidden until their games kick off.
        </p>
      ) : picks.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted">No card.</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {picks.map((pick) => (
            <li key={`${pick.gameId}-${pick.market}-${pick.label}`} className="flex items-baseline justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-bold leading-tight">
                  {pick.label}
                </span>
                <span className="block truncate text-[9px] text-muted tabnum">
                  {formatOdds(pick.odds)}
                </span>
              </span>
              <span
                className={`display shrink-0 text-[14px] leading-none tabnum ${
                  pick.result === 'win'
                    ? 'text-win'
                    : pick.result === 'loss'
                      ? 'text-loss'
                      : 'text-muted'
                }`}
              >
                {pick.result === 'win'
                  ? `+${Math.round(pick.points)}`
                  : pick.result === 'push'
                    ? 'P'
                    : pick.result === 'pending'
                      ? '·'
                      : '0'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
