'use client';

import { MARKET_LABEL, type PickemMarket } from '@/lib/types';
import { pointsForOdds } from '@/lib/odds';
import { formatOdds, formatSpread, formatTotal, formatKickoff } from '@/lib/format';

export interface GameOdds {
  market_type: string;
  selection: string;
  line: number | null;
  american_odds: number | null;
}

export interface Game {
  id: string;
  home_abbr: string;
  away_abbr: string;
  home_logo: string | null;
  away_logo: string | null;
  start_time: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
}

export interface Selection {
  marketType: PickemMarket;
  selection: string;
}

interface Props {
  game: Game;
  odds: readonly GameOdds[];
  enabledMarkets: readonly string[];
  selected: Selection | null;
  pickable: boolean;
  onSelect: (choice: Selection | null) => void;
}

const SHORT_MARKET: Record<PickemMarket, string> = {
  moneyline: 'ML',
  spread: 'SPR',
  total: 'O/U',
};

export default function PickCard({
  game,
  odds,
  enabledMarkets,
  selected,
  pickable,
  onSelect,
}: Props) {
  const find = (market: string, selection: string) =>
    odds.find((o) => o.market_type === market && o.selection === selection);

  const markets = (['moneyline', 'spread', 'total'] as const).filter((m) =>
    enabledMarkets.includes(m),
  );

  // Selecting the option already chosen clears it, so a pick can be undone
  // without a separate control.
  const choose = (marketType: PickemMarket, selection: string) => {
    if (!pickable) return;
    const same = selected?.marketType === marketType && selected?.selection === selection;
    onSelect(same ? null : { marketType, selection });
  };

  return (
    <article className={`card overflow-hidden ${selected ? 'card-hot' : ''}`}>
      <header className="flex items-center justify-between gap-2 px-3.5 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <TeamBadge abbr={game.away_abbr} logo={game.away_logo} />
          <span className="text-[11px] font-bold text-muted">AT</span>
          <TeamBadge abbr={game.home_abbr} logo={game.home_logo} />
        </div>
        <span className="shrink-0 text-[11px] font-semibold text-muted">
          {pickable ? formatKickoff(game.start_time) : <LockedTag game={game} />}
        </span>
      </header>

      <div className="mt-2.5">
        {markets.map((market, index) => {
          const [left, right] =
            market === 'total'
              ? (['over', 'under'] as const)
              : (['away', 'home'] as const);

          return (
            <div
              key={market}
              className={`flex items-stretch gap-2 px-2.5 py-1.5 ${
                index === 0 ? 'border-t border-line/60' : ''
              }`}
            >
              <div className="flex w-9 shrink-0 items-center justify-center">
                <span className="display text-[11px] leading-none text-muted">
                  {SHORT_MARKET[market]}
                </span>
                <span className="sr-only">{MARKET_LABEL[market]}</span>
              </div>

              <div className="grid flex-1 grid-cols-2 gap-2">
                {[left, right].map((side) => {
                  const row = find(market, side);
                  const isSelected =
                    selected?.marketType === market && selected?.selection === side;
                  const label = optionLabel(market, side, game, row);
                  const price = row ? formatOdds(row.american_odds) : null;
                  const pays = row ? pointsForOdds(row.american_odds) : null;
                  const available = Boolean(row) && pickable;

                  return (
                    <button
                      key={side}
                      type="button"
                      disabled={!available}
                      aria-pressed={isSelected}
                      aria-label={`${label}${pays !== null ? `, pays ${pays}` : ''}`}
                      onClick={() => choose(market, side)}
                      className={`tap relative flex flex-col items-center justify-center rounded-xl border
                        transition-[transform,background-color,box-shadow] duration-150
                        active:scale-[0.97] ${
                          isSelected
                            ? 'border-transparent text-brand-ink glow-brand'
                            : available
                              ? 'border-line bg-raised text-ink active:bg-line/50'
                              : 'border-line/40 bg-raised/30 text-muted'
                        }`}
                      style={
                        isSelected
                          ? {
                              backgroundImage:
                                'linear-gradient(180deg, rgb(var(--brand-hot)) 0%, rgb(var(--brand)) 60%, rgb(var(--brand-deep)) 100%)',
                            }
                          : undefined
                      }
                    >
                      <span className="text-[13px] font-bold leading-tight tabnum">{label}</span>
                      <span
                        className={`flex items-center gap-1.5 text-[10px] font-semibold leading-tight tabnum ${
                          isSelected ? 'text-brand-ink/80' : 'text-muted'
                        }`}
                      >
                        {price ?? '—'}
                        {pays !== null && (
                          <span
                            className={`display text-[12px] leading-none ${
                              isSelected ? 'text-brand-ink' : 'text-brand'
                            }`}
                          >
                            {pays}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function optionLabel(
  market: PickemMarket,
  side: string,
  game: Game,
  row: GameOdds | undefined,
): string {
  if (market === 'moneyline') {
    return side === 'home' ? game.home_abbr : game.away_abbr;
  }
  if (market === 'spread') {
    const abbr = side === 'home' ? game.home_abbr : game.away_abbr;
    return `${abbr} ${formatSpread(row?.line ?? null)}`;
  }
  return formatTotal(row?.line ?? null, side === 'over' ? 'over' : 'under');
}

function TeamBadge({ abbr, logo }: { abbr: string; logo: string | null }) {
  return (
    <span className="flex items-center gap-1.5">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- ESPN CDN logos,
        // already small and correctly sized; next/image would add a proxy hop.
        <img src={logo} alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />
      ) : (
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-line text-[9px] font-bold">
          {abbr.slice(0, 2)}
        </span>
      )}
      <span className="display text-[15px] leading-none">{abbr}</span>
    </span>
  );
}

function LockedTag({ game }: { game: Game }) {
  if (game.status === 'final') {
    return (
      <span className="tabnum font-bold">
        {game.away_score ?? 0}–{game.home_score ?? 0} <span className="text-muted">F</span>
      </span>
    );
  }
  if (game.status === 'in_progress') {
    return (
      <span className="flex items-center gap-1.5 font-bold text-live">
        <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-live" />
        <span className="tabnum">
          {game.away_score ?? 0}–{game.home_score ?? 0}
        </span>
      </span>
    );
  }
  if (game.status === 'postponed') return <span>PPD</span>;
  return <span className="text-muted">Locked</span>;
}
