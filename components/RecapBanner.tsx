import Link from 'next/link';

/**
 * Tuesday morning.
 *
 * The week ends and the app had nothing to say about it, so this is the one
 * thing at the top of Home once a week is graded: how it went, and a way into
 * the detail. It replaces the live hero rather than sitting beside it, because
 * on a Tuesday there is nothing live to show and the next lock is days away.
 */
export default function RecapBanner({
  week,
  leagueName,
  headline,
  points,
  record,
  rank,
  fieldSize,
  won,
}: {
  week: number;
  leagueName: string;
  headline: string;
  points: number;
  record: string;
  rank: number | null;
  fieldSize: number;
  won: boolean;
}) {
  return (
    <Link
      href={`/recap?week=${week}`}
      className={`card block overflow-hidden px-4 py-3.5 active:bg-raised ${won ? 'card-hot' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className="eyebrow">
          Week {week} recap · {leagueName}
        </span>
        <span className="text-[11px] font-bold text-brand">Full recap →</span>
      </div>

      <p className="display mt-1.5 text-balance text-[21px] leading-[1.05]">{headline}</p>

      <div className="mt-3 flex items-end gap-5">
        <Figure label="Points" value={String(points)} tone="text-brand" />
        <Figure label="Record" value={record} />
        <Figure
          label="Place"
          value={rank === null ? '—' : String(rank)}
          suffix={rank !== null && fieldSize > 0 ? `/${fieldSize}` : undefined}
          tone={rank === 1 ? 'text-gold' : 'text-ink'}
        />
      </div>
    </Link>
  );
}

function Figure({
  label,
  value,
  suffix,
  tone = 'text-ink',
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: string;
}) {
  return (
    <span className="block">
      <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <span className={`display block text-[19px] leading-none tabnum ${tone}`}>
        {value}
        {suffix && <span className="text-[11px] text-muted">{suffix}</span>}
      </span>
    </span>
  );
}
