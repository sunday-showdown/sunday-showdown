// Player data for TD Scorer.
//
// No free source publishes anytime-TD props, so a player's price comes from how
// often he actually scores. Two ESPN endpoints supply that: the season leaders
// list gives touchdown counts for everyone who has scored, and team rosters
// give the names, positions and headshots for the rest.
//
// A player with no touchdowns is not missing data — he is a long shot, and the
// shrunk-rate pricing treats him as exactly that.

const LEADERS =
  'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons';
const ROSTER = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
} as const;

/** Positions that realistically score. Linemen are noise on a pick list. */
export const SCORING_POSITIONS = new Set(['QB', 'RB', 'FB', 'WR', 'TE']);

export interface RosterPlayer {
  espnId: string;
  name: string;
  teamAbbr: string;
  position: string;
  headshotUrl: string | null;
  jersey: string | null;
}

export interface TouchdownCount {
  espnId: string;
  touchdowns: number;
}

async function getJson(url: string, timeoutMs = 12_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!response.ok) throw new Error(`ESPN returned ${response.status} for ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** The athlete id out of a `$ref` URL. */
export function athleteIdFromRef(ref: unknown): string | null {
  if (typeof ref !== 'string') return null;
  const match = ref.match(/\/athletes\/(\d+)/);
  return match ? match[1]! : null;
}

/** Parse the season leaders payload into touchdown counts per athlete. */
export function parseTouchdownLeaders(payload: unknown): TouchdownCount[] {
  const root = (payload ?? {}) as Record<string, any>;
  const categories = (root.categories ?? []) as Record<string, any>[];
  const totals = categories.find((c) => c.name === 'totalTouchdowns');
  if (!totals) return [];

  const counts: TouchdownCount[] = [];
  for (const leader of (totals.leaders ?? []) as Record<string, any>[]) {
    const espnId = athleteIdFromRef(leader?.athlete?.$ref);
    const touchdowns = Number(leader?.value);
    if (!espnId || !Number.isFinite(touchdowns)) continue;
    counts.push({ espnId, touchdowns });
  }
  return counts;
}

/** Parse a team roster into the players worth offering. */
export function parseRoster(payload: unknown, teamAbbr: string): RosterPlayer[] {
  const root = (payload ?? {}) as Record<string, any>;
  const groups = (root.athletes ?? []) as Record<string, any>[];

  const players: RosterPlayer[] = [];
  for (const group of groups) {
    // Practice squad and injured reserve cannot score on Sunday.
    if (group.position !== 'offense') continue;

    for (const athlete of (group.items ?? []) as Record<string, any>[]) {
      const position = athlete?.position?.abbreviation;
      if (!athlete?.id || !athlete?.displayName || !position) continue;
      if (!SCORING_POSITIONS.has(position)) continue;
      if (athlete?.status?.type && athlete.status.type !== 'active') continue;

      players.push({
        espnId: String(athlete.id),
        name: athlete.displayName,
        teamAbbr,
        position,
        headshotUrl: athlete?.headshot?.href ?? null,
        jersey: athlete?.jersey ?? null,
      });
    }
  }
  return players;
}

export async function fetchTouchdownLeaders(season: number): Promise<TouchdownCount[]> {
  const payload = await getJson(`${LEADERS}/${season}/types/2/leaders?limit=300`);
  return parseTouchdownLeaders(payload);
}

export async function fetchRoster(teamAbbr: string): Promise<RosterPlayer[]> {
  const payload = await getJson(`${ROSTER}/${teamAbbr}/roster`);
  return parseRoster(payload, teamAbbr);
}

/**
 * Rosters for several teams.
 *
 * Sequential on purpose: this runs in a serverless function against a public
 * endpoint, and hammering ESPN with 30 parallel requests is how a free feed
 * starts refusing you.
 */
export async function fetchRosters(
  teamAbbrs: readonly string[],
): Promise<{ players: RosterPlayer[]; warnings: string[] }> {
  const players: RosterPlayer[] = [];
  const warnings: string[] = [];

  for (const abbr of teamAbbrs) {
    try {
      players.push(...(await fetchRoster(abbr)));
    } catch (error) {
      warnings.push(`roster ${abbr}: ${error instanceof Error ? error.message : 'failed'}`);
    }
  }

  return { players, warnings };
}
