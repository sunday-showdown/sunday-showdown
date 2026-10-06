'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Sheet from './Sheet';
import Avatar from './Avatar';
import BattleArena from './BattleArena';
import ChallengeAlert from './ChallengeAlert';
import FighterBuilder from './FighterBuilder';
import FighterArt from './FighterArt';
import type { Duel, DuelsView, Opponent } from '@/lib/duels';

/**
 * The arena.
 *
 * Head to head used to be a list of league mates with a Challenge button, which
 * encoded the thing that was wrong with it: a league was the boundary of who you
 * could fight. It is not — a league is just a convenient group to start
 * competitions inside. So the people you can call out here are your friends and
 * your league mates together, and a duel runs for a week or for the season.
 */
export default function DuelPanel({
  view,
  currentWeek,
  roundsLeftFor,
  openDuelId,
}: {
  view: DuelsView;
  currentWeek: number;
  roundsLeftFor: Record<string, number>;
  /** A duel named in the URL, from a notification — opened first. */
  openDuelId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [target, setTarget] = useState<Opponent | null>(null);

  const call = async (body: unknown, key: string, success: string) => {
    setBusy(key);
    setMessage(null);
    try {
      const response = await fetch('/api/h2h', {
        method: key.startsWith('new:') ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage({ tone: 'error', text: result?.error ?? 'That did not work.' });
        return;
      }
      setMessage({ tone: 'ok', text: success });
      setTarget(null);
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: 'Network error.' });
    } finally {
      setBusy(null);
    }
  };

  const challenge = (opponent: Opponent, duration: 'week' | 'season') =>
    call(
      { opponentId: opponent.userId, duration },
      `new:${opponent.userId}`,
      duration === 'season'
        ? `Season duel sent to ${opponent.username}.`
        : `Challenge sent to ${opponent.username}.`,
    );

  const respond = (duel: Duel, action: 'accept' | 'decline' | 'cancel') =>
    call(
      { challengeId: duel.id, action },
      duel.id,
      action === 'accept' ? "You're on." : action === 'decline' ? 'Declined.' : 'Withdrawn.',
    );

  // The one challenge that takes over the screen: unanswered, aimed at me, and
  // not yet seen. A notification link wins over the newest one.
  const alert =
    view.incoming.find((duel) => duel.id === openDuelId && duel.seenAt === null) ??
    view.incoming.find((duel) => duel.seenAt === null) ??
    null;

  const ordered = [...view.live].sort((a, b) => {
    if (a.id === openDuelId) return -1;
    if (b.id === openDuelId) return 1;
    return 0;
  });

  return (
    <>
      {alert && (
        <ChallengeAlert
          duel={alert}
          busy={busy === alert.id}
          onAccept={() => respond(alert, 'accept')}
          onDecline={() => respond(alert, 'decline')}
        />
      )}

      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`mx-4 mb-3 rounded-xl px-4 py-3 text-sm ${
            message.tone === 'error' ? 'bg-loss/15 text-loss' : 'bg-brand/15 text-brand'
          }`}
        >
          {message.text}
        </p>
      )}

      <section className="px-4">
        <h2 className="eyebrow pb-2">Your fighter</h2>
        <FighterBuilder fighter={view.myFighter} />
      </section>

      {view.incoming.length > 0 && (
        <section className="mt-5 px-4">
          <h2 className="eyebrow pb-2">
            Called out
            <span className="display flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] leading-none text-brand-ink tabnum">
              {view.incoming.length}
            </span>
          </h2>
          <div className="space-y-2">
            {view.incoming.map((duel) => (
              <div key={duel.id} className="card card-hot px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <FighterArt
                    archetype={duel.them.fighter.archetype}
                    banner={duel.them.fighter.banner}
                    size={44}
                    className="shrink-0"
                  />
                  <Link href={`/h2h/${duel.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-bold">
                      {duel.them.fighter.name}{' '}
                      <span className="font-semibold text-muted">· {duel.them.username}</span>
                    </div>
                    <div className="text-[11px] text-muted">
                      {duel.duration === 'season' ? 'Season duel' : `Week ${duel.week}`}
                      {duel.leagueName ? ` · ${duel.leagueName}` : ' · Friend duel'}
                    </div>
                  </Link>
                </div>

                {duel.them.fighter.taunt && (
                  <p className="mt-2 text-[13px] font-semibold italic text-muted">
                    “{duel.them.fighter.taunt}”
                  </p>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy === duel.id}
                    onClick={() => respond(duel, 'accept')}
                    className="btn-primary h-10 flex-1 text-sm"
                  >
                    Fight
                  </button>
                  <button
                    type="button"
                    disabled={busy === duel.id}
                    onClick={() => respond(duel, 'decline')}
                    className="btn-ghost h-10 px-4 text-sm"
                  >
                    Back down
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {ordered.length > 0 && (
        <section className="mt-5 px-4">
          <h2 className="eyebrow pb-2">In the arena</h2>
          <div className="space-y-3">
            {ordered.map((duel) => (
              <div key={duel.id}>
                <Link href={`/h2h/${duel.id}`} className="block active:opacity-80">
                  <BattleArena
                    duel={duel}
                    currentWeek={currentWeek}
                    roundsLeft={roundsLeftFor[duel.id] ?? 0}
                  />
                </Link>
                {duel.status === 'pending' && duel.iAmChallenger && (
                  <button
                    type="button"
                    disabled={busy === duel.id}
                    onClick={() => respond(duel, 'cancel')}
                    className="mt-1.5 h-9 w-full text-[12px] font-semibold text-muted"
                  >
                    Withdraw the challenge
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-5 px-4">
        <h2 className="eyebrow pb-2">Call someone out</h2>
        {view.opponents.length === 0 ? (
          <div className="card px-4 py-4">
            <p className="text-sm text-muted">
              Nobody to fight yet. Follow a friend — once you follow each other you can duel,
              league or no league.
            </p>
            <Link href="/friends" className="btn-ghost mt-3 h-10 w-full text-sm">
              Find friends
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {view.opponents.map((opponent) => (
              // The whole row opens the challenge sheet. It used to be a
              // button that disabled itself whenever *any* duel with that
              // person was open, which meant one running fight made them
              // permanently unchallengeable — no rematch, no season duel
              // alongside a weekly one, and no way to tell why.
              <button
                key={opponent.userId}
                type="button"
                onClick={() => setTarget(opponent)}
                className="card flex w-full items-center gap-3 px-4 py-3 text-left active:bg-raised"
              >
                <Avatar username={opponent.username} url={opponent.avatarUrl} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{opponent.username}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {opponent.myWins > 0 || opponent.theirWins > 0
                      ? `${opponent.myWins}–${opponent.theirWins} v you · `
                      : ''}
                    {opponent.viaLeague ?? (opponent.isFriend ? 'Friend' : 'Rival')}
                  </span>
                </span>
                {opponent.openWeekly || opponent.openSeason ? (
                  <span className="chip shrink-0 bg-brand/15 text-brand">Fighting</span>
                ) : (
                  <span className="btn-ghost pointer-events-none h-9 px-3 text-xs">Challenge</span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {view.settled.length > 0 && (
        <section className="mt-5 px-4">
          <h2 className="eyebrow pb-2">Settled</h2>
          <div className="space-y-2">
            {view.settled.map((duel) => {
              const won = duel.winnerId === duel.me.userId;
              const tied = duel.winnerId === null;

              return (
                <Link
                  key={duel.id}
                  href={`/h2h/${duel.id}`}
                  className="card flex items-center justify-between px-4 py-3 active:bg-raised"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {duel.them.fighter.name}
                    </span>
                    <span className="block truncate text-[11px] text-muted">
                      {duel.them.username} · {duel.duration === 'season' ? 'Season' : `Week ${duel.week}`}
                      {duel.knockoutWeek !== null ? ' · KO' : ''}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabnum text-sm">
                      {Math.round(duel.me.points)} – {Math.round(duel.them.points)}
                    </span>
                    <span
                      className={`chip ${
                        tied ? 'bg-push/20 text-push' : won ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'
                      }`}
                    >
                      {tied ? 'Draw' : won ? 'Won' : 'Lost'}
                    </span>
                    <span className="text-muted">›</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Week or season is the one decision worth a sheet: a season duel is an
          eighteen-week commitment and should not be a mis-tap. */}
      <Sheet
        open={target !== null}
        onClose={() => setTarget(null)}
        title={target ? `Challenge ${target.username}` : 'Challenge'}
      >
        {target && (
          <div className="space-y-2">
            <button
              type="button"
              disabled={busy === `new:${target.userId}` || target.openWeekly}
              onClick={() => challenge(target, 'week')}
              className="card w-full px-4 py-3.5 text-left active:bg-raised disabled:opacity-45"
            >
              <div className="display text-[17px] leading-none">This week</div>
              <p className="mt-1.5 text-[12px] text-muted">
                {target.openWeekly
                  ? 'You already have a weekly duel running with them.'
                  : `One round. Week ${currentWeek} cards, highest score wins, done Tuesday.`}
              </p>
            </button>

            <button
              type="button"
              disabled={busy === `new:${target.userId}` || target.openSeason}
              onClick={() => challenge(target, 'season')}
              className="card w-full px-4 py-3.5 text-left active:bg-raised disabled:opacity-45"
            >
              <div className="display text-[17px] leading-none">All season</div>
              <p className="mt-1.5 text-[12px] text-muted">
                {target.openSeason
                  ? 'A season duel with them is already under way.'
                  : 'Both start at 100 HP. Every week the better card lands a hit. First one down loses, or the healthier fighter takes it in week 18.'}
              </p>
            </button>

            <p className="pt-1 text-[11px] text-muted">
              {target.viaLeague
                ? `You both play in ${target.viaLeague}, so you share a slate.`
                : 'You play in different leagues, so each of you brings your own card.'}
            </p>
          </div>
        )}
      </Sheet>
    </>
  );
}
