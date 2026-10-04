// ESPN scoreboard client.
//
// One free, keyless endpoint supplies the schedule, live scores, final results
// and DraftKings lines for all three Pick'em markets. It replaces the paid odds
// provider and the public CORS proxies the previous build depended on.

import { parseEvent, type ParsedGame } from './parse';

const SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

// ESPN rejects requests without a browser-like User-Agent.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
} as const;

export interface ScoreboardResult {
  season: number;
  week: number;
  games: ParsedGame[];
  /** Events the feed returned that could not be parsed into a game. */
  skipped: number;
}

export class EspnError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EspnError';
  }
}

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!response.ok) {
      throw new EspnError(`ESPN returned ${response.status} for ${url}`, response.status);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof EspnError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new EspnError(`ESPN request timed out after ${timeoutMs}ms`);
    }
    throw new EspnError(error instanceof Error ? error.message : 'ESPN request failed');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch one week's scoreboard.
 *
 * Omitting week and season returns the current week, which is what the live
 * score sync wants; the schedule sync passes them explicitly.
 */
export async function fetchScoreboard(
  options: { season?: number; week?: number; seasonType?: number; timeoutMs?: number } = {},
): Promise<ScoreboardResult> {
  const { season, week, seasonType = 2, timeoutMs = 10_000 } = options;

  const params = new URLSearchParams();
  if (season !== undefined) params.set('dates', String(season));
  if (week !== undefined) params.set('week', String(week));
  if (season !== undefined || week !== undefined) params.set('seasontype', String(seasonType));

  const query = params.toString();
  const payload = (await getJson(query ? `${SCOREBOARD}?${query}` : SCOREBOARD, timeoutMs)) as
    | Record<string, any>
    | null;

  const events = (payload?.events ?? []) as unknown[];
  const resolvedWeek = payload?.week?.number ?? week;
  const resolvedSeason = payload?.season?.year ?? season;

  const games: ParsedGame[] = [];
  let skipped = 0;
  for (const event of events) {
    const game = parseEvent(event, resolvedWeek);
    if (game) games.push(game);
    else skipped += 1;
  }

  if (typeof resolvedSeason !== 'number' || typeof resolvedWeek !== 'number') {
    throw new EspnError('ESPN response carried no season or week');
  }

  return { season: resolvedSeason, week: resolvedWeek, games, skipped };
}

/**
 * The season and week ESPN currently considers live.
 *
 * Used instead of deriving the week from the calendar, which the previous build
 * did and which drifts around bye weeks and the playoff boundary.
 */
export async function fetchCurrentWeek(): Promise<{ season: number; week: number }> {
  const { season, week } = await fetchScoreboard();
  return { season, week };
}
