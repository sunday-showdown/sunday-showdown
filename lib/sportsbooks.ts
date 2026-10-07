// Sportsbooks a shared slip can be attributed to.
//
// Worth being plain about the limit here, because it shapes the whole feature.
// No US book publishes an API that would let this app read somebody's actual
// wagers, and none offers a public deep link that pre-builds a specific bet in
// their app. Both are partner-only. So this is sharing, not syncing: a person
// enters what they placed, the slip renders as a card their league can tail or
// fade, and the book link opens the book.
//
// `host` is used for the link and for the favicon, so adding a book is one row
// and no new asset.

export interface Sportsbook {
  /** Stored on shared_bets.book. Changing one orphans existing slips. */
  id: string;
  name: string;
  /** Two or three letters for the slip card. */
  short: string;
  host: string;
  /** The book's own colour, for the card's accent. */
  accent: string;
}

export const SPORTSBOOKS: readonly Sportsbook[] = [
  { id: 'draftkings', name: 'DraftKings', short: 'DK', host: 'sportsbook.draftkings.com', accent: '#53d337' },
  { id: 'fanduel', name: 'FanDuel', short: 'FD', host: 'sportsbook.fanduel.com', accent: '#1493ff' },
  { id: 'betmgm', name: 'BetMGM', short: 'MGM', host: 'sports.betmgm.com', accent: '#c8a964' },
  { id: 'caesars', name: 'Caesars', short: 'CZR', host: 'sportsbook.caesars.com', accent: '#d4af37' },
  { id: 'espnbet', name: 'ESPN BET', short: 'ESPN', host: 'espnbet.com', accent: '#ff0033' },
  { id: 'fanatics', name: 'Fanatics', short: 'FAN', host: 'sportsbook.fanatics.com', accent: '#1b7ced' },
  { id: 'bet365', name: 'bet365', short: '365', host: 'www.bet365.com', accent: '#027b5b' },
  { id: 'hardrock', name: 'Hard Rock', short: 'HR', host: 'app.hardrock.bet', accent: '#8b1a2b' },
  { id: 'prizepicks', name: 'PrizePicks', short: 'PP', host: 'app.prizepicks.com', accent: '#7c3aed' },
  { id: 'underdog', name: 'Underdog', short: 'UD', host: 'underdogfantasy.com', accent: '#ff4d4d' },
  { id: 'other', name: 'Somewhere else', short: '•', host: '', accent: '#8d8d8d' },
] as const;

const BY_ID = new Map(SPORTSBOOKS.map((book) => [book.id, book]));

export function findBook(id: string | null | undefined): Sportsbook | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

/** Display name for a book id, including ones no longer in the list. */
export function bookName(id: string | null | undefined): string {
  return findBook(id)?.name ?? 'a sportsbook';
}

/** The book's site, or null for "somewhere else". */
export function bookUrl(id: string | null | undefined): string | null {
  const book = findBook(id);
  if (!book || !book.host) return null;
  return `https://${book.host}`;
}

/** Whether an id names a book this app knows about. */
export function isSportsbook(id: unknown): boolean {
  return typeof id === 'string' && BY_ID.has(id);
}

/**
 * The books to offer somebody, given what they said they use.
 *
 * Everything when they have expressed no preference, because a new person has
 * not been asked yet and an empty list would be a dead end. "Somewhere else"
 * always survives, so a one-off bet at a book they do not normally use is still
 * loggable without a trip to settings.
 */
export function booksFor(preferred: readonly string[] | null | undefined): readonly Sportsbook[] {
  if (!preferred || preferred.length === 0) return SPORTSBOOKS;
  const wanted = new Set(preferred);
  return SPORTSBOOKS.filter((book) => wanted.has(book.id) || book.id === 'other');
}
