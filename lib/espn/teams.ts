// Team reference data.
//
// nfl_games has foreign keys to nfl_teams on both abbreviations, so this must
// run before any game sync — otherwise every game insert fails its FK.

import type { SupabaseClient } from '@supabase/supabase-js';

const TEAMS = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
} as const;

export interface ParsedTeam {
  abbr: string;
  espnId: string;
  name: string;
  city: string | null;
  displayName: string;
  logo: string | null;
  color: string | null;
  altColor: string | null;
}

/** Pull the 32 teams out of ESPN's deeply nested teams payload. */
export function parseTeams(payload: unknown): ParsedTeam[] {
  const root = (payload ?? {}) as Record<string, any>;
  const entries = root.sports?.[0]?.leagues?.[0]?.teams ?? [];

  const teams: ParsedTeam[] = [];
  for (const entry of entries as Record<string, any>[]) {
    const team = entry?.team;
    if (!team?.abbreviation || !team?.id) continue;
    // Pro Bowl and other non-competing entries would break the schedule FKs.
    if (team.isActive === false || team.isAllStar === true) continue;

    teams.push({
      abbr: team.abbreviation,
      espnId: String(team.id),
      name: team.name ?? team.shortDisplayName ?? team.abbreviation,
      city: team.location ?? null,
      displayName: team.displayName ?? `${team.location ?? ''} ${team.name ?? ''}`.trim(),
      logo: team.logos?.[0]?.href ?? null,
      color: team.color ? `#${team.color}` : null,
      altColor: team.alternateColor ? `#${team.alternateColor}` : null,
    });
  }
  return teams;
}

export async function fetchTeams(timeoutMs = 10_000): Promise<ParsedTeam[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(TEAMS, { headers: HEADERS, signal: controller.signal });
    if (!response.ok) throw new Error(`ESPN teams returned ${response.status}`);
    return parseTeams(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

export async function syncTeams(
  db: SupabaseClient,
): Promise<{ teamsWritten: number; warnings: string[] }> {
  const teams = await fetchTeams();
  const warnings: string[] = [];

  // A short slate means ESPN gave us something unexpected; overwriting the
  // table from it could orphan games mid-season.
  if (teams.length < 32) {
    warnings.push(`expected 32 teams, parsed ${teams.length}`);
  }
  if (teams.length === 0) {
    return { teamsWritten: 0, warnings: ['no teams parsed; nothing written'] };
  }

  const { error } = await db.from('nfl_teams').upsert(
    teams.map((t) => ({
      abbr: t.abbr,
      espn_id: t.espnId,
      name: t.name,
      city: t.city,
      display_name: t.displayName,
      logo: t.logo,
      color: t.color,
      alt_color: t.altColor,
    })),
    { onConflict: 'abbr' },
  );

  if (error) throw new Error(`failed to upsert teams: ${error.message}`);
  return { teamsWritten: teams.length, warnings };
}
