'use client';

import { useEffect, useState } from 'react';
import { archetypeOf, bannerOf, fighterRecord } from '@/lib/fighters';
import { MAX_HP, describeDamage, hpTone } from '@/lib/battle';
import type { Duel, DuelSide } from '@/lib/duels';

/**
 * A duel, drawn as a fight.
 *
 * The numbers are the same ones grading wrote — points scored, damage dealt
 * (lib/battle.ts). Nothing here computes a result; it animates one. That matters
 * because an arena that did its own arithmetic would eventually disagree with
 * the standings, and the standings are the thing people argue about.
 *
 * The health bars animate from full to their real value on mount rather than
 * rendering settled, so a week that went badly is something you watch happen.
 * A reduced-motion user gets the end state immediately — globals.css collapses
 * the transition durations, and the bars are correct at every frame regardless.
 */
export default function BattleArena({
  duel,
  currentWeek,
  roundsLeft,
}: {
  duel: Duel;
  currentWeek: number;
  roundsLeft: number;
}) {
  const [drawn, setDrawn] = useState(false);

  // One frame at full health, then the real value, so the bar has somewhere to
  // travel from. Without the rAF the browser coalesces both styles into one
  // paint and nothing moves.
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const resolved = duel.status === 'completed';
  const iWon = resolved && duel.winnerId === duel.me.userId;
  const drew = resolved && duel.winnerId === null;
  const lastRound = duel.rounds[duel.rounds.length - 1];

  return (
    <div className="card overflow-hidden">
      {/* The arena floor: a pit of light with the two fighters facing in. */}
      <div className="relative isolate px-4 pb-4 pt-3">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-24"
          style={{
            background:
              'radial-gradient(80% 100% at 50% 100%, rgb(var(--brand) / 0.22) 0%, transparent 70%)',
          }}
        />

        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
          <span>
            {duel.duration === 'season' ? 'Season duel' : `Week ${duel.week}`}
            {duel.leagueName ? ` · ${duel.leagueName}` : ' · Friend duel'}
          </span>
          <span>
            {resolved
              ? drew
                ? 'Draw'
                : iWon
                  ? 'You won'
                  : 'You lost'
              : duel.duration === 'season'
                ? `${roundsLeft} round${roundsLeft === 1 ? '' : 's'} left`
                : duel.status === 'pending'
                  ? 'Awaiting reply'
                  : 'Live'}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <FighterPlinth side={duel.me} mine drawn={drawn} />

          <div className="pb-6 text-center">
            <div className="display text-[13px] leading-none text-muted">VS</div>
            {duel.knockoutWeek !== null && (
              <div className="display mt-1 text-[10px] leading-none text-brand">
                KO wk {duel.knockoutWeek}
              </div>
            )}
          </div>

          <FighterPlinth side={duel.them} mine={false} drawn={drawn} />
        </div>

        {/* What the most recent round did, in the language of the fight. */}
        {lastRound && (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-raised/70 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              Week {lastRound.week}
            </span>
            <span className="text-[12px] font-semibold">
              <span className="tabnum">{Math.round(lastRound.myPoints)}</span>
              <span className="px-1.5 text-muted">—</span>
              <span className="tabnum">{Math.round(lastRound.theirPoints)}</span>
            </span>
            <span
              className={`text-[11px] font-bold ${
                lastRound.myDamage > 0
                  ? 'text-win'
                  : lastRound.theirDamage > 0
                    ? 'text-brand'
                    : 'text-muted'
              }`}
            >
              {lastRound.myDamage > 0
                ? `${describeDamage(lastRound.myDamage)} · −${lastRound.myDamage}`
                : lastRound.theirDamage > 0
                  ? `Took ${lastRound.theirDamage}`
                  : 'Traded nothing'}
            </span>
          </div>
        )}

        {/* A season duel's history, so a long fight reads as a fight. */}
        {duel.duration === 'season' && duel.rounds.length > 1 && (
          <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
            {duel.rounds.map((round) => (
              <div
                key={round.week}
                className={`shrink-0 rounded-lg px-2 py-1 text-center ${
                  round.myDamage > 0
                    ? 'bg-win/15'
                    : round.theirDamage > 0
                      ? 'bg-brand/15'
                      : 'bg-raised'
                }`}
              >
                <div className="text-[8px] font-bold uppercase tracking-wide text-muted">
                  W{round.week}
                </div>
                <div
                  className={`display text-[13px] leading-none tabnum ${
                    round.myDamage > 0
                      ? 'text-win'
                      : round.theirDamage > 0
                        ? 'text-brand'
                        : 'text-muted'
                  }`}
                >
                  {round.myDamage > 0
                    ? `+${round.myDamage}`
                    : round.theirDamage > 0
                      ? `−${round.theirDamage}`
                      : '0'}
                </div>
              </div>
            ))}
          </div>
        )}

        {!resolved && duel.rounds.length === 0 && (
          <p className="mt-3 text-center text-[11px] text-muted">
            {duel.status === 'pending'
              ? 'No blows until they accept.'
              : duel.week > currentWeek
                ? `Week ${duel.week} has not opened yet.`
                : `Week ${duel.week} settles on Tuesday. Make your picks.`}
          </p>
        )}
      </div>
    </div>
  );
}

const TONE_BAR: Record<ReturnType<typeof hpTone>, string> = {
  healthy: 'bg-win',
  hurt: 'bg-gold',
  critical: 'bg-brand',
  down: 'bg-loss',
};

function FighterPlinth({
  side,
  mine,
  drawn,
}: {
  side: DuelSide;
  mine: boolean;
  drawn: boolean;
}) {
  const archetype = archetypeOf(side.fighter.archetype);
  const banner = bannerOf(side.fighter.banner);
  const down = side.hp <= 0;
  const percent = drawn ? Math.max(0, Math.min(100, (side.hp / MAX_HP) * 100)) : 100;

  return (
    <div className={mine ? 'text-left' : 'text-right'}>
      <div className={`flex items-end gap-2 ${mine ? '' : 'flex-row-reverse'}`}>
        <span
          aria-hidden="true"
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[24px] transition-[filter,transform,opacity] duration-700 ${
            down ? 'opacity-45 grayscale' : ''
          }`}
          style={{
            backgroundImage: `linear-gradient(160deg, ${banner.from} 0%, ${banner.to} 100%)`,
            transform: down ? 'rotate(-14deg) translateY(4px)' : mine ? 'none' : 'scaleX(-1)',
          }}
        >
          {archetype.glyph}
        </span>
      </div>

      <div className="mt-1.5 truncate text-[13px] font-bold">{side.fighter.name}</div>
      <div className="truncate text-[9px] font-bold uppercase tracking-[0.1em] text-muted">
        {side.username} · {fighterRecord(side.fighter)}
      </div>

      <div
        className={`mt-1.5 h-2 overflow-hidden rounded-full bg-raised ${mine ? '' : 'flex justify-end'}`}
        role="img"
        aria-label={`${side.fighter.name}: ${side.hp} of ${MAX_HP} hit points`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-[900ms] ease-out ${TONE_BAR[hpTone(side.hp)]}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-1 flex items-baseline gap-1" style={{ justifyContent: mine ? 'flex-start' : 'flex-end' }}>
        <span className="display text-[15px] leading-none tabnum">{side.hp}</span>
        <span className="text-[9px] font-bold uppercase tracking-wide text-muted">
          {down ? 'down' : 'hp'}
        </span>
      </div>
    </div>
  );
}
