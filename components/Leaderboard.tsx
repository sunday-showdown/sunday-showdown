'use client';

import { useState } from 'react';
import Link from 'next/link';
import Avatar from './Avatar';
import type { StandingRow } from '@/lib/standings';

export interface RankedPlayer extends StandingRow {
  avatarUrl: string | null;
  currentStreak: number;
  longestStreak: number;
}

type Board = 'points' | 'weeks' | 'best' | 'streak' | 'td';

const BOARDS: { id: Board; label: string; blurb: string }[] = [
  { id: 'points', label: 'Points', blurb: 'Season total' },
  { id: 'weeks', label: 'Weeks won', blurb: 'Outright wins' },
  { id: 'best', label: 'Best week', blurb: 'Highest single card' },
  { id: 'streak', label: 'Streak', blurb: 'Correct picks in a row' },
  { id: 'td', label: 'TD Scorer', blurb: 'Its own board — TD points never touch the season table' },
];

/**
 * The league, ranked four ways.
 *
 * One table ordered by season points answers one question and tells the person
 * in fifth place in March that there is nothing left to play for. Weeks won,
 * best single card and current streak each have a different leader, which is
 * the point: there is almost always a board somebody is near the top of.
 *
 * The season table stays the default and keeps the movement arrows, because it
 * is still the one that decides the season.
 */
export default function Leaderboard({
  rows,
  myUserId,
}: {
  rows: readonly RankedPlayer[];
  myUserId: string;
}) {
  const [board, setBoard] = useState<Board>('points');

  const valueOf = (row: RankedPlayer): number => {
    switch (board) {
      case 'weeks':
        return row.weeklyWins;
      case 'best':
        return Math.round(row.bestWeek);
      case 'streak':
        return row.currentStreak;
      case 'td':
        return Math.round(row.tdPoints);
      default:
        return Math.round(row.totalPoints);
    }
  };

  // Ranked fresh for each board, ties sharing a place the way the season table
  // does, rather than reusing the season rank against a different number.
  const ordered = [...rows].sort(
    (a, b) => valueOf(b) - valueOf(a) || a.username.localeCompare(b.username),
  );

  const placed = ordered.map((row, index) => {
    const previous = index > 0 ? ordered[index - 1]! : null;
    return { row, place: previous && valueOf(previous) === valueOf(row) ? -1 : index + 1 };
  });

  // -1 marks a tie with the row above; resolve it to that row's place.
  let lastPlace = 1;
  const table = placed.map(({ row, place }) => {
    if (place !== -1) lastPlace = place;
    return { row, place: lastPlace };
  });

  const podium = table.slice(0, 3);
  const current = BOARDS.find((b) => b.id === board)!;

  return (
    <>
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-3">
        {BOARDS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setBoard(option.id)}
            aria-pressed={board === option.id}
            className={`display h-9 shrink-0 rounded-xl px-3.5 text-[13px] leading-none transition-colors ${
              board === option.id ? 'bg-brand text-brand-ink' : 'bg-raised text-muted'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {table.length === 0 ? null : (
        <>
          {/* Three on a podium rather than one hero row: second and third are
              the places people actually check. */}
          <div className="mb-4 flex items-end justify-center gap-2">
            {[podium[1], podium[0], podium[2]].map((entry, index) => {
              if (!entry) return <div key={index} className="w-[30%]" />;
              const height = entry.place === 1 ? 'h-[76px]' : entry.place === 2 ? 'h-[58px]' : 'h-[46px]';
              const tone =
                entry.place === 1 ? 'text-gold' : entry.place === 2 ? 'text-ink' : 'text-muted';

              return (
                <Link
                  key={entry.row.userId}
                  href={`/u/${entry.row.userId}`}
                  className="flex w-[30%] flex-col items-center"
                >
                  <Avatar
                    username={entry.row.username}
                    url={entry.row.avatarUrl}
                    size={entry.place === 1 ? 'lg' : 'md'}
                  />
                  <span className="mt-1.5 w-full truncate text-center text-[12px] font-bold">
                    {entry.row.username}
                  </span>
                  <span className={`display text-[17px] leading-none tabnum ${tone}`}>
                    {valueOf(entry.row)}
                  </span>
                  <div
                    className={`mt-1.5 flex w-full items-start justify-center rounded-t-xl pt-1.5 ${height} ${
                      entry.place === 1 ? 'bg-gold/15' : 'bg-raised'
                    }`}
                  >
                    <span className={`display text-[20px] leading-none ${tone}`}>{entry.place}</span>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="card overflow-hidden">
            <ul className="divide-y divide-line/60">
              {table.map(({ row, place }) => {
                const isMe = row.userId === myUserId;
                return (
                  <li
                    key={row.userId}
                    className={`flex items-center gap-3 px-3.5 py-3 ${isMe ? 'bg-brand/[0.07]' : ''}`}
                  >
                    <span className="flex w-9 shrink-0 flex-col items-center">
                      <span
                        className={`display text-[17px] leading-none tabnum ${
                          place === 1 ? 'text-gold' : 'text-muted'
                        }`}
                      >
                        {place}
                      </span>
                      {board === 'points' && <Movement places={row.movement} />}
                    </span>

                    <Avatar username={row.username} url={row.avatarUrl} size="sm" />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/u/${row.userId}`} className="truncate text-[15px] font-bold">
                          {row.username}
                        </Link>
                        {isMe && <span className="chip bg-brand/15 text-brand">You</span>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] tabnum text-muted">
                        {board === 'streak' ? (
                          <span>Best run {row.longestStreak}</span>
                        ) : board === 'td' ? (
                          <span>{Math.round(row.totalPoints)} pick&apos;em pts</span>
                        ) : (
                          <>
                            <span>{row.correctMl} ML</span>
                            <span>·</span>
                            <span>{row.correctSpread} SPR</span>
                            <span>·</span>
                            <span>{row.correctTotals} O/U</span>
                          </>
                        )}
                        {board !== 'points' && board !== 'td' && (
                          <>
                            <span>·</span>
                            <span>{Math.round(row.totalPoints)} pts</span>
                          </>
                        )}
                      </div>
                    </div>

                    <span className="display shrink-0 text-[22px] leading-none tabnum">
                      {valueOf(row)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="mt-2.5 px-1 text-[11px] leading-relaxed text-muted">
            {current.blurb}. Ties share a place.
            {board === 'points' && ' Arrows show places gained since the last graded week.'}
          </p>
        </>
      )}
    </>
  );
}

function Movement({ places }: { places: number | null }) {
  if (places === null || places === 0) return null;

  const up = places > 0;
  return (
    <span
      className={`mt-0.5 flex items-center gap-[1px] text-[9px] font-bold leading-none tabnum ${
        up ? 'text-win' : 'text-loss'
      }`}
      aria-label={`${up ? 'Up' : 'Down'} ${Math.abs(places)} place${Math.abs(places) === 1 ? '' : 's'}`}
    >
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>
      {Math.abs(places)}
    </span>
  );
}
