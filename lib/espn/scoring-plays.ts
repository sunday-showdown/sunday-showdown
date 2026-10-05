// Who scored.
//
// ESPN's summary endpoint lists scoring plays but does NOT populate
// athletesInvolved — the only record of the scorer is the play text. The
// format is consistent enough to parse:
//
//   "Jonathan Taylor 5 Yd Rush (Spencer Shrader Kick)"
//   "Treylon Burks 47 Yd pass from Athan Kaliakmanis (Drew Stevens Kick)"
//   "Micah Parsons 30 Yd Interception Return (Kick)"
//
// In every case the scorer is the name before the yardage. The passer, named
// after "from", did not score and must not be credited.

const SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
} as const;

/** The scorer's name from a play's text, or null if it does not parse. */
export function scorerFromPlayText(text: unknown): string | null {
  if (typeof text !== 'string') return null;

  // Everything before the yardage. Non-greedy so "from" clauses are excluded.
  const match = text.match(/^\s*(.+?)\s+\d+\s*yds?\b/i);
  if (!match) return null;

  const name = match[1]!.trim();
  // A team name rather than a player (e.g. a safety credited to the defence).
  if (!name || !name.includes(' ')) return null;
  return name;
}

/** Normalise for matching against stored player names. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every player who scored a touchdown in one summary payload. */
export function parseTouchdownScorers(payload: unknown): string[] {
  const root = (payload ?? {}) as Record<string, any>;
  const plays = (root.scoringPlays ?? []) as Record<string, any>[];

  const scorers = new Set<string>();
  for (const play of plays) {
    // Field goals and extra points are not touchdowns.
    if (play?.scoringType?.name !== 'touchdown') continue;
    const name = scorerFromPlayText(play?.text);
    if (name) scorers.add(normalizeName(name));
  }
  return [...scorers];
}

export async function fetchTouchdownScorers(espnGameId: string): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${SUMMARY}?event=${espnGameId}`, {
      headers: HEADERS,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ESPN summary returned ${response.status}`);
    return parseTouchdownScorers(await response.json());
  } finally {
    clearTimeout(timer);
  }
}
