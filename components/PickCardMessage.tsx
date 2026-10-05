import { RESULT_TONE } from '@/lib/format';
import type { SharedCardView } from '@/lib/chat';

/**
 * Somebody's card, shared into a channel.
 *
 * Not a snapshot. The picks are read live every time this renders, so a card
 * posted on Thursday is a scoreboard by Sunday night — which is the point of
 * sharing one. The two numbers at the bottom are the two states a card is ever
 * in: what is already banked, and what is still live.
 */
export default function PickCardMessage({ card }: { card: SharedCardView }) {
  const settled = card.graded;
  const total = card.picks.length;
  const won = card.picks.filter((pick) => pick.result === 'win').length;
  const complete = settled === total && total > 0;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line/70 px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
            Week {card.week} card
          </div>
          <div className="display mt-0.5 text-[16px] leading-none">
            {complete ? `${won} of ${total} hit` : `${total} pick${total === 1 ? '' : 's'}`}
          </div>
        </div>

        {settled > 0 && !complete && (
          <span className="chip bg-live/15 text-live">{settled}/{total} in</span>
        )}
      </div>

      <ul className="divide-y divide-line/50">
        {card.picks.map((pick, index) => (
          <li key={`${index}-${pick.label}`} className="flex items-center gap-2 px-3.5 py-1.5">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                pick.result === 'win'
                  ? 'bg-win'
                  : pick.result === 'loss'
                    ? 'bg-loss'
                    : pick.result === 'push'
                      ? 'bg-push'
                      : 'bg-line'
              }`}
            />
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{pick.label}</span>
            <span className="shrink-0 text-[10px] text-muted">{pick.matchup}</span>
            <span
              className={`display w-8 shrink-0 text-right text-[13px] leading-none tabnum ${
                pick.result === 'pending' ? 'text-muted' : (RESULT_TONE[pick.result] ?? 'text-muted')
              }`}
            >
              {pick.result === 'loss' ? '—' : pick.points}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-4 border-t border-line/70 px-3.5 py-2.5">
        <Figure label="Banked" value={card.earned} tone="text-win" />
        {card.atStake > 0 && <Figure label="Still live" value={card.atStake} tone="text-brand" />}
      </div>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={`display text-[17px] leading-none tabnum ${tone}`}>{value}</div>
    </div>
  );
}
