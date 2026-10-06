'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import FighterArt from './FighterArt';

/**
 * The first ninety seconds.
 *
 * A new person arrives at a dark screen of jargon — a card, a lock, a pot, a
 * duel — and nothing on it says what any of that means or that the scoring is
 * unusual. So this is four cards and a way out, shown once per account.
 *
 * It is deliberately small. The brief was an introduction that does not lose
 * people's attention, and the failure mode of an onboarding flow is always the
 * same: it explains everything, so nobody reads any of it. One headline and one
 * sentence per card; the scoring rule first because it is the one thing nobody
 * can guess; Skip visible on every card from the first frame, not buried.
 *
 * Nothing here gates the app. Skipping is a real choice and the tour never
 * comes back — /profile has a "Show me around again" for anybody who wants it.
 */

interface Card {
  eyebrow: string;
  title: string;
  body: string;
  art: 'odds' | 'card' | 'modes' | 'nav';
}

const CARDS: Card[] = [
  {
    eyebrow: 'The one rule',
    title: 'Every pick is a $10 bet',
    body: 'You score what it pays. A heavy favourite is worth almost nothing; a long shot is worth a lot. Picking chalk will not win you the season.',
    art: 'odds',
  },
  {
    eyebrow: 'Each week',
    title: 'One line per game',
    body: 'Take the moneyline, the spread or the total — your choice, one per game. Everything locks at the first Sunday kickoff and grades itself.',
    art: 'card',
  },
  {
    eyebrow: 'Beyond the card',
    title: 'Survivor, scorers, duels',
    body: 'Last one standing, call the end zone, or fight a friend week by week. Any of them can carry a pot, and the app just tracks who has paid.',
    art: 'modes',
  },
  {
    eyebrow: 'Finding things',
    title: "It's all in the bar",
    body: 'Home is what needs you. Picks is your card. Chat is your league. Ranks is everyone. You is your profile and your bets.',
    art: 'nav',
  },
];

export default function Onboarding() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (closing) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [closing]);

  const finish = () => {
    setClosing(true);
    // Fire and forget. Worst case it shows once more; blocking the app on a
    // bookkeeping write would be a worse first impression than that.
    fetch('/api/onboarding', { method: 'POST' })
      .catch(() => {})
      .finally(() => router.refresh());
  };

  if (!mounted || closing) return null;

  const card = CARDS[step]!;
  const last = step === CARDS.length - 1;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Sunday Showdown"
      className="fixed inset-0 z-[70] flex flex-col bg-bg"
      style={{
        paddingTop: 'max(var(--safe-top, env(safe-area-inset-top)), 1rem)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)',
      }}
    >
      <div className="flex items-center justify-between px-5 pt-2">
        <div className="flex gap-1.5" aria-hidden="true">
          {CARDS.map((_, index) => (
            <span
              key={index}
              className={`h-1 rounded-full transition-all duration-300 ${
                index === step ? 'w-6 bg-brand' : 'w-1.5 bg-line'
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={finish}
          className="h-9 px-1 text-[13px] font-semibold text-muted"
        >
          Skip
        </button>
      </div>

      {/* key on the step so the art and copy animate in on every advance, which
          is what makes four cards feel like a tour instead of a form. */}
      <div
        key={step}
        className="flex flex-1 flex-col items-center justify-center px-7 text-center"
        style={{ animation: 'pop-in 320ms ease-out both' }}
      >
        <Art kind={card.art} />

        <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.18em] text-brand">
          {card.eyebrow}
        </p>
        <h2 className="display mt-2 text-balance text-[34px] leading-[0.98]">{card.title}</h2>
        <p className="mt-3 max-w-[20rem] text-balance text-[15px] leading-relaxed text-muted">
          {card.body}
        </p>
      </div>

      <div className="flex flex-col gap-2 px-5">
        <button
          type="button"
          onClick={() => (last ? finish() : setStep(step + 1))}
          className="btn-primary w-full text-[16px]"
        >
          {last ? "Let's go" : 'Next'}
        </button>
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="h-9 text-[13px] font-semibold text-muted"
          >
            Back
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * A picture per card.
 *
 * Built from the app's own pieces rather than illustrations: the odds card is a
 * real pick row, the nav card is the real tab bar. Somebody who has just seen
 * these recognises them thirty seconds later.
 */
function Art({ kind }: { kind: Card['art'] }) {
  if (kind === 'odds') {
    return (
      <div className="w-full max-w-[17rem] space-y-2">
        {[
          { label: 'KC to win', odds: '−600', pts: '+12', tone: 'text-muted' },
          { label: 'DEN +13.5', odds: '−110', pts: '+19', tone: 'text-ink' },
          { label: 'DEN to win', odds: '+430', pts: '+53', tone: 'text-brand' },
        ].map((row) => (
          <div key={row.label} className="card flex items-center justify-between px-3.5 py-2.5">
            <span className="text-[14px] font-bold">{row.label}</span>
            <span className="flex items-baseline gap-3">
              <span className="text-[11px] tabnum text-muted">{row.odds}</span>
              <span
                className={`display w-10 text-right text-[19px] leading-none tabnum ${row.tone}`}
              >
                {row.pts}
              </span>
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (kind === 'card') {
    return (
      <div className="card w-full max-w-[17rem] px-4 py-3.5">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Week 5</span>
          <span className="display text-[17px] leading-none tabnum text-brand">2d 4h</span>
        </div>
        <div className="display mt-1.5 text-[26px] leading-none">11 of 16 in</div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-raised">
          <div className="h-full w-[68%] rounded-full bg-brand" />
        </div>
      </div>
    );
  }

  if (kind === 'modes') {
    return (
      <div className="flex w-full max-w-[17rem] items-center justify-center gap-3">
        <FighterArt archetype="centurion" banner="crimson" size={72} />
        <span className="display text-[15px] text-muted">vs</span>
        <FighterArt archetype="streak" banner="gold" size={72} />
      </div>
    );
  }

  return (
    <div className="card w-full max-w-[17rem] overflow-hidden px-1 py-2">
      <div className="flex">
        {['Home', 'Picks', 'Chat', 'Ranks', 'You'].map((label, index) => (
          <span
            key={label}
            className={`flex flex-1 flex-col items-center gap-1 text-[10px] font-medium ${
              index === 0 ? 'text-brand' : 'text-muted'
            }`}
          >
            <span
              className={`h-4 w-4 rounded-md ${index === 0 ? 'bg-brand/30' : 'bg-line'}`}
              aria-hidden="true"
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
