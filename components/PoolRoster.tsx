import Link from 'next/link';
import Avatar from './Avatar';
import { teamsLeft, type PoolEntrant } from '@/lib/survivorPool';

/**
 * The field.
 *
 * The part of survivor that was missing: who is still standing, what they have
 * locked in this week, and what they have already spent. That last column is
 * the one that matters most late in a season — knowing somebody has already
 * used their three best teams tells you more than the standings do.
 *
 * A pick that cannot be shown yet reads as "locked in" rather than as nothing,
 * because the difference between a quiet player and a committed one is the
 * whole tension of a Sunday morning. The team itself only appears once that
 * game is under way, and that is enforced in the database, not here.
 */
export default function PoolRoster({
  entrants,
  week,
}: {
  entrants: readonly PoolEntrant[];
  week: number;
}) {
  if (entrants.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <ul className="divide-y divide-line/60">
        {entrants.map((entrant) => (
          <li
            key={entrant.userId}
            className={`flex items-center gap-3 px-3.5 py-3 ${
              entrant.isMe ? 'bg-brand/[0.07]' : ''
            } ${entrant.alive ? '' : 'opacity-55'}`}
          >
            <Avatar username={entrant.username} url={entrant.avatarUrl} size="sm" />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Link href={`/u/${entrant.userId}`} className="truncate text-[14.5px] font-bold">
                  {entrant.username}
                </Link>
                {entrant.isMe && <span className="chip bg-brand/15 text-brand">You</span>}
              </div>

              <div className="mt-0.5 truncate text-[10px] text-muted">
                {entrant.alive
                  ? `${entrant.survived} survived · ${teamsLeft(entrant.usedTeams)} teams left`
                  : `Out in week ${entrant.outWeek ?? '—'}`}
              </div>

              {/* What they have spent. The constraint that makes the format. */}
              {entrant.usedTeams.length > 0 && (
                <div className="no-scrollbar mt-1.5 flex gap-1 overflow-x-auto">
                  {entrant.usedTeams.map((used) => (
                    <span
                      key={used.week}
                      title={`Week ${used.week}`}
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold leading-none ${
                        used.result === 'eliminated'
                          ? 'bg-loss/20 text-loss line-through'
                          : used.result === 'push'
                            ? 'bg-push/20 text-push'
                            : 'bg-raised text-muted'
                      }`}
                    >
                      {used.team}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="shrink-0 text-right">
              {!entrant.alive ? (
                <span className="chip bg-loss/15 text-loss">Out</span>
              ) : entrant.thisWeekTeam ? (
                <span className="display text-[17px] leading-none">{entrant.thisWeekTeam}</span>
              ) : entrant.pickedThisWeek ? (
                <span className="chip bg-win/15 text-win">Locked in</span>
              ) : (
                <span className="chip bg-raised text-muted">No pick</span>
              )}
              <div className="mt-1 text-[9px] font-bold uppercase tracking-wide text-muted">
                Wk {week}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
