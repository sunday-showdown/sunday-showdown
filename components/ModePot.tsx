'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { POT_LABEL, type PotView } from '@/lib/pot';

/**
 * A mode's pot, inline on that mode's screen.
 *
 * Collapsed by default and showing only the one number anybody wants at a
 * glance — how much is in — because this belongs beside the game, not in front
 * of it. A pot that occupied the top of the screen would push the picks down on
 * every visit for a thing most people check once a week.
 *
 * Two-sided on purpose. The owner ticking people off is only half of it — the
 * half that leaves everyone else wondering whether their payment landed. So a
 * member can say "I've paid", the owner sees who is waiting, and confirming is
 * the thing that actually moves money into the collected total. The database
 * enforces which of the two of you may do which, not this component.
 *
 * Every write goes through /api/pot, which records who did it in pot_audit.
 * That trail is the whole value of tracking a pot in software rather than in a
 * group text.
 */
export default function ModePot({
  pot,
  leagueId,
  season,
  competitionId,
}: {
  pot: PotView;
  /** Null for a pot that belongs to a competition rather than to a league. */
  leagueId: string | null;
  season: number;
  /** Set when the pot belongs to one pool rather than to the mode in general. */
  competitionId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('20');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const post = async (payload: Record<string, unknown>, key: string) => {
    setBusy(key);
    setError('');

    try {
      const response = await fetch('/api/pot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(result.error ?? 'That did not work.');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error.');
    } finally {
      setBusy(null);
    }
  };

  const label = POT_LABEL[pot.mode];
  const paidCount = pot.members.filter((member) => member.paid).length;

  // What this person should do next, which is the only thing the collapsed row
  // has space to say.
  const myStatus = pot.me.paid
    ? { text: 'You are paid up', tone: 'text-win' }
    : pot.me.claimed
      ? { text: 'Waiting on confirmation', tone: 'text-live' }
      : { text: `You owe $${pot.buyIn}`, tone: 'text-brand' };

  return (
    <section className="px-4">
      <div className="card overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-raised"
        >
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-[17px]"
          >
            💰
          </span>

          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
              {label}
            </div>
            {pot.potId ? (
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="display text-[20px] leading-none tabnum text-win">
                  ${pot.confirmed}
                </span>
                <span className="text-[11px] text-muted">
                  in of ${pot.projected} · {paidCount}/{pot.members.length} paid
                </span>
              </div>
            ) : (
              <div className="mt-0.5 text-[13px] font-semibold text-muted">
                Not tracking one — tap to start
              </div>
            )}
          </div>

          {pot.potId && (
            <span
              className={`chip shrink-0 ${
                pot.isOwner
                  ? pot.awaitingConfirmation > 0
                    ? 'bg-live/15 text-live'
                    : 'bg-raised text-muted'
                  : pot.me.paid
                    ? 'bg-win/15 text-win'
                    : pot.me.claimed
                      ? 'bg-live/15 text-live'
                      : 'bg-brand/15 text-brand'
              }`}
            >
              {pot.isOwner
                ? pot.awaitingConfirmation > 0
                  ? `${pot.awaitingConfirmation} to confirm`
                  : 'Owner'
                : myStatus.text}
            </span>
          )}

          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className={`shrink-0 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && (
          <div className="animate-pop-in border-t border-line/70 px-4 py-3.5">
            {error && (
              <p role="alert" className="mb-3 rounded-xl bg-loss/15 px-3 py-2 text-[12px] text-loss">
                {error}
              </p>
            )}

            {!pot.potId ? (
              <>
                <p className="text-[12.5px] leading-relaxed text-muted">
                  A shared ledger of who has paid in for {label.toLowerCase()}. The app never
                  handles money — it just means nobody has to keep the list in their head.
                </p>

                <label htmlFor={`buyin-${pot.mode}`} className="eyebrow mb-1.5 mt-3">
                  Buy-in per person
                </label>
                <div className="flex gap-2">
                  <input
                    id={`buyin-${pot.mode}`}
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))}
                    className="field tabnum flex-1"
                  />
                  <button
                    type="button"
                    disabled={busy !== null || !amount}
                    onClick={() =>
                      post(
                        {
                          action: 'create',
                          leagueId,
                          season,
                          buyIn: Number(amount),
                          competitionType: pot.mode,
                          competitionId: competitionId ?? null,
                          name: label,
                        },
                        'create',
                      )
                    }
                    className="btn-primary shrink-0 px-4 text-sm"
                  >
                    {busy === 'create' ? '…' : 'Start'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-3 grid grid-cols-3 divide-x divide-line rounded-xl border border-line">
                  <Figure label="Buy-in" value={`$${pot.buyIn}`} />
                  <Figure label="Collected" value={`$${pot.confirmed}`} tone="text-win" />
                  <Figure label="Projected" value={`$${pot.projected}`} />
                </div>

                {/* Your own half of the arrangement, before the list of
                    everybody else's. */}
                {!pot.isOwner && (
                  <div
                    className={`mb-3 flex items-center gap-3 rounded-xl border px-3.5 py-3 ${
                      pot.me.paid
                        ? 'border-win/40 bg-win/10'
                        : pot.me.claimed
                          ? 'border-live/40 bg-live/10'
                          : 'border-brand/40 bg-brand/10'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className={`text-[13.5px] font-bold ${myStatus.tone}`}>
                        {myStatus.text}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-snug text-muted">
                        {pot.me.paid
                          ? 'Confirmed by whoever runs the pot.'
                          : pot.me.claimed
                            ? 'They will tick you off once it lands.'
                            : 'Pay them however you normally do, then tap this.'}
                      </div>
                    </div>

                    {!pot.me.paid && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          post({ action: 'claim', potId: pot.potId, claimed: !pot.me.claimed }, 'claim')
                        }
                        className={`h-9 shrink-0 rounded-xl px-3.5 text-[12px] font-bold ${
                          pot.me.claimed ? 'border border-line bg-raised text-muted' : 'bg-brand text-brand-ink'
                        }`}
                      >
                        {busy === 'claim' ? '…' : pot.me.claimed ? 'Undo' : "I've paid"}
                      </button>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  {pot.members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between rounded-xl bg-raised px-3 py-2"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold">{member.username}</span>
                        {member.claimed && (
                          <span className="chip bg-live/15 text-live">Says paid</span>
                        )}
                      </span>
                      {pot.isOwner ? (
                        <button
                          type="button"
                          disabled={busy === member.userId}
                          onClick={() =>
                            post(
                              {
                                action: 'setPaid',
                                potId: pot.potId,
                                targetUserId: member.userId,
                                paid: !member.paid,
                              },
                              member.userId,
                            )
                          }
                          aria-pressed={member.paid}
                          className={`h-7 shrink-0 rounded-lg px-2.5 text-[10px] font-bold transition-colors ${
                            member.paid
                              ? 'bg-win/20 text-win'
                              : member.claimed
                                ? 'bg-live/20 text-live'
                                : 'bg-surface text-muted'
                          }`}
                        >
                          {busy === member.userId
                            ? '…'
                            : member.paid
                              ? 'PAID'
                              : member.claimed
                                ? 'CONFIRM'
                                : 'MARK PAID'}
                        </button>
                      ) : (
                        <span
                          className={`chip ${member.paid ? 'bg-win/15 text-win' : 'bg-surface text-muted'}`}
                        >
                          {member.paid ? 'Paid' : 'Owes'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <p className="mt-3 text-[11px] leading-relaxed text-muted">
                  {pot.isOwner
                    ? 'Every change records who made it and when, so there is a trail if anyone disagrees later.'
                    : 'Saying you have paid does not move the total — only the pot owner can confirm it.'}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Figure({ label, value, tone = 'text-ink' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-2 py-2.5 text-center">
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={`display mt-0.5 text-[17px] leading-none tabnum ${tone}`}>{value}</div>
    </div>
  );
}
