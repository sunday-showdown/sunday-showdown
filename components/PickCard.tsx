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
    <article className={`card overflow-hidden ${selected ? 'border-brand/50' : ''}`}>
      <header className="flex items-center justify-between gap-2 px-4 pt-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TeamBadge abbr={game.away_abbr} logo={game.away_logo} />
          <span className="text-muted">@</span>
          <TeamBadge abbr={game.home_abbr} logo={game.home_logo} />
        </div>
        <span className="text-[11px] font-medium text-muted">
          {pickable ? formatKickoff(game.start_time) : <LockedTag game={game} />}
        </span>
      </header>

      <div className="mt-2.5 divide-y divide-line/70 border-t border-line/70">
        {markets.map((market) => {
          const [left, right] =
            market === 'total'
              ? (['over', 'under'] as const)
              : (['away', 'home'] as const);

          return (
            <div key={market} className="flex items-stretch gap-2 px-3 py-2">
              <div className="flex w-16 shrink-0 flex-col justify-center">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  {MARKET_LABEL[market]}
                </span>
                
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
                      onClick={() => choose(market, side)}
                      className={`flex h-12 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition-colors ${
                        isSelected
                          ? 'border-brand bg-brand text-brand-ink'
                          : available
                            ? 'border-line bg-raised text-ink active:bg-line/60'
                            : 'border-line/50 bg-raised/40 text-muted'
                      }`}
                    >
                      <span className="tabnum leading-tight">{label}</span>
                      <span
                        className={`flex items-center gap-1 text-[10px] font-medium leading-tight tabnum ${
                          isSelected ? 'text-brand-ink/75' : 'text-muted'
                        }`}
                      >
                        {price ?? '—'}
                        {pays !== null && (
                          // What it pays is the number that actually matters,
                          // so it gets the emphasis and the price is context.
                          <span className={isSelected ? 'font-bold' : 'font-bold text-brand'}>
                            +{pays}
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
        <img src={logo} alt="" width={20} height={20} className="h-5 w-5 object-contain" />
      ) : (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-line text-[9px] font-bold">
          {abbr.slice(0, 2)}
        </span>
      )}
      {abbr}
    </span>
  );
}

function LockedTag({ game }: { game: Game }) {
  if (game.status === 'final') {
    return (
      <span className="tabnum">
        Final {game.away_score ?? 0}–{game.home_score ?? 0}
      </span>
    );
  }
  if (game.status === 'in_progress') {
    return (
      <span className="flex items-center gap-1 font-semibold text-live">
        <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-live" />
        Live {game.away_score ?? 0}–{game.home_score ?? 0}
      </span>
    );
  }
  if (game.status === 'postponed') return <span>Postponed</span>;
  return <span>Locked</span>;
}
