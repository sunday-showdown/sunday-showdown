// Pure parsers for ESPN's scoreboard payload.
//
// ESPN returns odds as display strings rather than numbers — "-535", "+400",
// "o47.5", "PK" — so every value needs coercing before it reaches the database.
// These are kept free of I/O so they can be tested against the real shapes
// captured from the live endpoint.

import type { GameStatus, MarketType } from '../types';

export interface ParsedOdds {
  marketType: MarketType;
  selection: string;
  teamAbbr: string | null;
  line: number | null;
  americanOdds: number | null;
}

export interface ParsedGame {
  espnId: string;
  season: number;
  week: number;
  seasonType: number;
  homeAbbr: string;
  awayAbbr: string;
  homeTeam: string | null;
  awayTeam: string | null;
  homeLogo: string | null;
  awayLogo: string | null;
  homeColor: string | null;
  awayColor: string | null;
  startTime: string;
  status: GameStatus;
  statusDetail: string | null;
  homeScore: number | null;
  awayScore: number | null;
  provider: string | null;
  odds: ParsedOdds[];
}

/**
 * American odds from an ESPN display string.
 *
 * "EVEN" and "PK" mean a pick'em, which is +100 in American terms.
 */
export function parseAmericanOdds(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.trunc(raw) : null;
  if (typeof raw !== 'string') return null;

  const text = raw.trim().toUpperCase();
  if (text === '' || text === '-' || text === '--') return null;
  if (text === 'EVEN' || text === 'EV' || text === 'PK') return 100;

  const value = Number(text.replace(/^\+/, ''));
  if (!Number.isFinite(value) || value === 0) return null;

  // A book never prices between -100 and +100; a value in that range means the
  // string was something we do not understand.
  return Math.abs(value) < 100 ? null : Math.trunc(value);
}

/**
 * A line value from an ESPN display string.
 *
 * Totals arrive prefixed ("o47.5", "u47.5"); spreads arrive signed ("-9.5",
 * "+3"). The prefix is dropped — which side of a total a row refers to is
 * carried by `selection`, not by the number.
 */
export function parseLineValue(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;

  const text = raw.trim().toUpperCase();
  if (text === '' || text === '-' || text === '--') return null;
  if (text === 'PK' || text === 'EVEN' || text === 'EV') return 0;

  const value = Number(text.replace(/^[OU]/, '').replace(/^\+/, ''));
  return Number.isFinite(value) ? value : null;
}

/**
 * ESPN status to our status enum.
 *
 * `state` is the reliable field: the `name` values are numerous
 * (STATUS_HALFTIME, STATUS_END_PERIOD, STATUS_DELAYED...) and all of them mean
 * the game is underway. Anything unrecognised falls back to 'scheduled', which
 * the database's progression trigger will reject rather than letting it
 * un-finalise a completed game.
 */
export function parseGameStatus(statusType: unknown): GameStatus {
  const type = (statusType ?? {}) as { name?: string; state?: string; completed?: boolean };
  const name = (type.name ?? '').toUpperCase();

  if (name === 'STATUS_POSTPONED' || name === 'STATUS_CANCELED' || name === 'STATUS_CANCELLED') {
    return 'postponed';
  }
  if (type.completed === true || name === 'STATUS_FINAL') return 'final';

  switch (type.state) {
    case 'post':
      return 'final';
    case 'in':
      return 'in_progress';
    case 'pre':
      return 'scheduled';
    default:
      return 'scheduled';
  }
}

function toScore(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/**
 * Flatten one ESPN odds entry into one row per market per side.
 *
 * ESPN nests the same numbers in several places; `pointSpread`/`total`/
 * `moneyline` carry explicit per-side prices, so they are preferred, with the
 * flat `spread`/`overUnder` fields as a fallback for older payloads that omit
 * the nested form.
 */
export function parseOddsEntry(
  entry: unknown,
  homeAbbr: string,
  awayAbbr: string,
): ParsedOdds[] {
  const odds = (entry ?? {}) as Record<string, any>;
  const rows: ParsedOdds[] = [];

  const homeMl = parseAmericanOdds(odds.moneyline?.home?.close?.odds ?? odds.moneyline?.home?.open?.odds);
  const awayMl = parseAmericanOdds(odds.moneyline?.away?.close?.odds ?? odds.moneyline?.away?.open?.odds);
  if (homeMl !== null) {
    rows.push({ marketType: 'moneyline', selection: 'home', teamAbbr: homeAbbr, line: null, americanOdds: homeMl });
  }
  if (awayMl !== null) {
    rows.push({ marketType: 'moneyline', selection: 'away', teamAbbr: awayAbbr, line: null, americanOdds: awayMl });
  }

  // ESPN's flat `spread` is always from the home team's perspective.
  const flatSpread = parseLineValue(odds.spread);
  const homeSpread = parseLineValue(odds.pointSpread?.home?.close?.line) ?? flatSpread;
  const awaySpread =
    parseLineValue(odds.pointSpread?.away?.close?.line) ??
    (flatSpread === null ? null : -flatSpread);

  if (homeSpread !== null) {
    rows.push({
      marketType: 'spread',
      selection: 'home',
      teamAbbr: homeAbbr,
      line: homeSpread,
      americanOdds: parseAmericanOdds(odds.pointSpread?.home?.close?.odds) ?? -110,
    });
  }
  if (awaySpread !== null) {
    rows.push({
      marketType: 'spread',
      selection: 'away',
      teamAbbr: awayAbbr,
      line: awaySpread,
      americanOdds: parseAmericanOdds(odds.pointSpread?.away?.close?.odds) ?? -110,
    });
  }

  const totalLine =
    parseLineValue(odds.total?.over?.close?.line) ?? parseLineValue(odds.overUnder);
  if (totalLine !== null) {
    rows.push({
      marketType: 'total',
      selection: 'over',
      teamAbbr: null,
      line: totalLine,
      americanOdds: parseAmericanOdds(odds.total?.over?.close?.odds ?? odds.overOdds) ?? -110,
    });
    rows.push({
      marketType: 'total',
      selection: 'under',
      teamAbbr: null,
      line: parseLineValue(odds.total?.under?.close?.line) ?? totalLine,
      americanOdds: parseAmericanOdds(odds.total?.under?.close?.odds ?? odds.underOdds) ?? -110,
    });
  }

  return rows;
}

/**
 * Parse one ESPN scoreboard event.
 *
 * Returns null when the event is missing the fields a game cannot exist
 * without, rather than writing a half-built row.
 */
export function parseEvent(event: unknown, fallbackWeek?: number): ParsedGame | null {
  const ev = (event ?? {}) as Record<string, any>;
  const comp = (ev.competitions ?? [])[0];
  if (!comp || !ev.id) return null;

  const competitors = (comp.competitors ?? []) as Record<string, any>[];
  const home = competitors.find((c) => c.homeAway === 'home');
  const away = competitors.find((c) => c.homeAway === 'away');
  const homeAbbr = home?.team?.abbreviation;
  const awayAbbr = away?.team?.abbreviation;
  if (!homeAbbr || !awayAbbr || !ev.date) return null;

  const week = ev.week?.number ?? fallbackWeek;
  const season = ev.season?.year;
  if (typeof week !== 'number' || typeof season !== 'number') return null;

  const oddsEntry = (comp.odds ?? [])[0];

  return {
    espnId: String(ev.id),
    season,
    week,
    seasonType: ev.season?.type ?? 2,
    homeAbbr,
    awayAbbr,
    homeTeam: home?.team?.displayName ?? null,
    awayTeam: away?.team?.displayName ?? null,
    homeLogo: home?.team?.logo ?? null,
    awayLogo: away?.team?.logo ?? null,
    homeColor: home?.team?.color ? `#${home.team.color}` : null,
    awayColor: away?.team?.color ? `#${away.team.color}` : null,
    startTime: new Date(ev.date).toISOString(),
    status: parseGameStatus(comp.status?.type),
    statusDetail: comp.status?.type?.shortDetail ?? null,
    homeScore: toScore(home?.score),
    awayScore: toScore(away?.score),
    provider: oddsEntry?.provider?.name ?? null,
    // Odds disappear from the feed at kickoff. An in-progress game yielding an
    // empty array must not be read as "the lines were removed" — callers keep
    // whatever was captured before the game started.
    odds: oddsEntry ? parseOddsEntry(oddsEntry, homeAbbr, awayAbbr) : [],
  };
}
