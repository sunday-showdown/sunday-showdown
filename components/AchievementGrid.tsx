export interface AchievementTile {
  id: string;
  name: string;
  description: string;
  earned: boolean;
}

const ICON: Record<string, string> = {
  first_pick: '🚩',
  first_win: '✅',
  perfect_week: '💯',
  weekly_winner: '🏆',
  streak_5: '🔥',
  streak_10: '🌋',
  underdog_hero: '⚡',
  survivor_champion: '🛡️',
  full_season: '📅',
};

/** Locked badges are shown, not hidden — knowing what is missing is the point. */
export default function AchievementGrid({ tiles }: { tiles: readonly AchievementTile[] }) {
  const earned = tiles.filter((t) => t.earned).length;

  return (
    <section className="mt-5">
      <div className="flex items-baseline justify-between px-4 pb-2">
        <h2 className="eyebrow">
          Badges
        </h2>
        <span className="text-xs tabnum text-muted">
          {earned} of {tiles.length}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 px-4">
        {tiles.map((tile) => (
          <div
            key={tile.id}
            title={tile.description}
            className={`card flex flex-col items-center gap-1 px-2 py-3 text-center ${
              tile.earned ? 'border-brand/40' : 'opacity-35'
            }`}
          >
            <span aria-hidden="true" className="text-xl leading-none">
              {ICON[tile.id] ?? '⭐'}
            </span>
            <span className="text-[11px] font-semibold leading-tight">{tile.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
