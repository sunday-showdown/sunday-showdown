// Channels and messages.
//
// The feed used to be a ledger: the app wrote lines about what happened and
// everybody read them. Nobody talks to a ledger. This is the same league, with
// rooms — a general channel, a trash-talk channel, a room per game mode, and
// direct messages — carrying text, images, GIFs and shared bet slips.
//
// Loading is written to a fixed number of queries per screen regardless of how
// many messages or rooms are on it. The per-item query is the thing that makes
// a chat screen feel slow, and a league with six channels and fifty messages
// would otherwise issue hundreds.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BetLeg } from './bets';
import { describePick } from './format';
import { pointsForOdds } from './odds';

export const MESSAGE_PAGE = 50;
export const MAX_BODY = 2000;

export type ChannelKind = 'league' | 'mode' | 'dm';
export type MessageKind = 'text' | 'image' | 'bet_slip' | 'pick_card' | 'system';
export type Stance = 'tail' | 'fade';

export interface ChannelSummary {
  id: string;
  kind: ChannelKind;
  name: string;
  topic: string | null;
  emoji: string | null;
  mode: string | null;
  leagueId: string | null;
  isDefault: boolean;
  lastMessageAt: string | null;
  unread: number;
  /** For a DM, the other person. Null for league and mode channels. */
  partner: { userId: string; username: string } | null;
}

export interface MessageAuthor {
  userId: string;
  username: string;
  avatarUrl: string | null;
}

export interface SharedBetView {
  id: string;
  book: string;
  legs: BetLeg[];
  americanOdds: number;
  stake: number | null;
  note: string | null;
  result: string;
  tails: number;
  fades: number;
  myStance: Stance | null;
  ownerId: string;
}

export interface CardPick {
  label: string;
  matchup: string;
  points: number;
  result: string;
  /** Carried for ordering, not for display. */
  kickoff: string;
}

export interface SharedCardView {
  season: number;
  week: number;
  picks: CardPick[];
  /** Points already banked from graded picks. */
  earned: number;
  /** Everything still live, if it all lands. */
  atStake: number;
  graded: number;
}

export interface ChatMessage {
  id: string;
  kind: MessageKind;
  body: string | null;
  author: MessageAuthor | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  attachment: {
    url: string;
    type: string | null;
    width: number | null;
    height: number | null;
  } | null;
  bet: SharedBetView | null;
  card: SharedCardView | null;
  replyTo: { id: string; author: string | null; excerpt: string } | null;
  reactions: Record<string, number>;
  myReactions: string[];
}

/** Quick reactions offered on every message, Discord-style. */
export const QUICK_REACTIONS = ['🔥', '😂', '💀', '🫡', '😭', '👏'] as const;

const MENTION = /@([A-Za-z0-9_]{3,24})/g;

/**
 * Usernames mentioned in a message.
 *
 * Case-insensitive and de-duplicated, because "@Dave @dave" is one person
 * being talked to once, not two notifications.
 */
export function extractMentions(body: string | null | undefined): string[] {
  if (!body) return [];
  const found = new Set<string>();
  for (const match of body.matchAll(MENTION)) {
    const name = match[1];
    if (name) found.add(name.toLowerCase());
  }
  return [...found];
}

/** A short, single-line version of a message, for a reply chip or a preview. */
export function excerpt(message: {
  kind: MessageKind;
  body: string | null;
  deleted?: boolean;
}): string {
  if (message.deleted) return 'Message deleted';
  if (message.kind === 'image') return '📷 Image';
  if (message.kind === 'bet_slip') return '🎟️ Bet slip';
  if (message.kind === 'pick_card') return '🗒️ Their card';
  const text = (message.body ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > 70 ? `${text.slice(0, 69)}…` : text;
}

/** The label a channel shows in a list: "# general" or a person's name. */
export function channelLabel(channel: ChannelSummary): string {
  if (channel.kind === 'dm') return channel.partner?.username ?? 'Direct message';
  return channel.name;
}

interface ChannelRow {
  id: string;
  kind: ChannelKind;
  name: string;
  topic: string | null;
  emoji: string | null;
  mode: string | null;
  league_id: string | null;
  is_default: boolean;
  last_message_at: string | null;
  position: number;
}

/**
 * Every channel this person can open: all their leagues' rooms, and their DMs.
 *
 * Deliberately not scoped to one league. It used to take a leagueId and filter,
 * which meant a second league's rooms simply did not appear anywhere in the app
 * — there was no screen that listed them, so they were unreachable. The caller
 * groups by league instead, which hides nothing.
 *
 * Five queries, flat, whatever the shape of the data — channels, unread counts,
 * DM membership, the names behind those memberships, and nothing else.
 */
export async function loadChannels(
  db: SupabaseClient,
  userId: string,
): Promise<ChannelSummary[]> {
  const [{ data: rows, error }, { data: unreadRows }, { data: dmRows }] = await Promise.all([
    db
      .from('channels')
      .select('id, kind, name, topic, emoji, mode, league_id, is_default, last_message_at, position')
      .order('position', { ascending: true }),
    db.rpc('channel_unread_counts'),
    db.from('channel_members').select('channel_id, user_id'),
  ]);

  if (error) throw new Error(`failed to load channels: ${error.message}`);

  const unread = new Map<string, number>(
    ((unreadRows ?? []) as { channel_id: string; unread: number }[]).map((r) => [
      r.channel_id,
      r.unread,
    ]),
  );

  // Who is on the other side of each DM. RLS already limits these rows to
  // conversations this person is in.
  const partnerOf = new Map<string, string>();
  for (const row of (dmRows ?? []) as { channel_id: string; user_id: string }[]) {
    if (row.user_id !== userId) partnerOf.set(row.channel_id, row.user_id);
  }

  const partnerIds = [...new Set(partnerOf.values())];
  const { data: profiles } = partnerIds.length
    ? await db.from('profiles').select('user_id, username').in('user_id', partnerIds)
    : { data: [] as { user_id: string; username: string }[] };

  const nameOf = new Map(
    ((profiles ?? []) as { user_id: string; username: string }[]).map((p) => [
      p.user_id,
      p.username,
    ]),
  );

  const channels = ((rows ?? []) as ChannelRow[])
    // No filter: RLS already limits these to leagues this person is in.
    .map((row): ChannelSummary => {
      const partnerId = partnerOf.get(row.id) ?? null;
      return {
        id: row.id,
        kind: row.kind,
        name: row.name,
        topic: row.topic,
        emoji: row.emoji,
        mode: row.mode,
        leagueId: row.league_id,
        isDefault: row.is_default,
        lastMessageAt: row.last_message_at,
        unread: unread.get(row.id) ?? 0,
        partner:
          row.kind === 'dm' && partnerId
            ? { userId: partnerId, username: nameOf.get(partnerId) ?? 'Someone' }
            : null,
      };
    })
    // A DM with nobody on the other side is a conversation the other person
    // deleted their account out of. Showing it would be a dead row.
    .filter((channel) => channel.kind !== 'dm' || channel.partner !== null);

  return channels;
}

/** One channel, or null when it does not exist or is not readable. */
export async function loadChannel(
  db: SupabaseClient,
  userId: string,
  channelId: string,
): Promise<ChannelSummary | null> {
  const { data: row } = await db
    .from('channels')
    .select('id, kind, name, topic, emoji, mode, league_id, is_default, last_message_at, position')
    .eq('id', channelId)
    .maybeSingle();

  if (!row) return null;
  const channel = row as ChannelRow;

  let partner: ChannelSummary['partner'] = null;
  if (channel.kind === 'dm') {
    const { data: members } = await db
      .from('channel_members')
      .select('user_id')
      .eq('channel_id', channelId);

    const otherId = (members ?? [])
      .map((m) => m.user_id as string)
      .find((id) => id !== userId);

    if (otherId) {
      const { data: profile } = await db
        .from('profiles')
        .select('username')
        .eq('user_id', otherId)
        .maybeSingle();
      partner = { userId: otherId, username: (profile?.username as string) ?? 'Someone' };
    }
  }

  return {
    id: channel.id,
    kind: channel.kind,
    name: channel.name,
    topic: channel.topic,
    emoji: channel.emoji,
    mode: channel.mode,
    leagueId: channel.league_id,
    isDefault: channel.is_default,
    lastMessageAt: channel.last_message_at,
    unread: 0,
    partner,
  };
}

/**
 * A page of messages, oldest first.
 *
 * `before` pages backwards for infinite scroll. Reactions, bets, tails and
 * authors are each one query for the whole page.
 */
export async function loadMessages(
  db: SupabaseClient,
  userId: string,
  channelId: string,
  before?: string,
): Promise<ChatMessage[]> {
  let query = db
    .from('messages')
    .select(
      'id, kind, body, user_id, attachment_url, attachment_type, attachment_width, attachment_height, bet_id, card_challenge_id, reply_to_id, edited_at, deleted_at, created_at',
    )
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(MESSAGE_PAGE);

  if (before) query = query.lt('created_at', before);

  const { data: rows, error } = await query;
  if (error) throw new Error(`failed to load messages: ${error.message}`);

  const messages = (rows ?? []) as Record<string, unknown>[];
  if (messages.length === 0) return [];

  const ids = messages.map((m) => m.id as string);
  const authorIds = [...new Set(messages.map((m) => m.user_id).filter((id): id is string => typeof id === 'string'))];
  const betIds = [...new Set(messages.map((m) => m.bet_id).filter((id): id is string => typeof id === 'string'))];
  const cardKeys = messages
    .filter((m) => typeof m.card_challenge_id === 'string' && typeof m.user_id === 'string')
    .map((m) => ({ challengeId: m.card_challenge_id as string, userId: m.user_id as string }));
  const replyIds = [...new Set(messages.map((m) => m.reply_to_id).filter((id): id is string => typeof id === 'string'))];

  const [{ data: reactions }, { data: profiles }, { data: bets }, { data: replies }] =
    await Promise.all([
      db.from('message_reactions').select('message_id, user_id, emoji').in('message_id', ids),
      authorIds.length
        ? db.from('profiles').select('user_id, username, avatar_url').in('user_id', authorIds)
        : Promise.resolve({ data: [] }),
      betIds.length
        ? db
            .from('shared_bets')
            .select('id, user_id, book, legs, american_odds, stake, note, result')
            .in('id', betIds)
        : Promise.resolve({ data: [] }),
      replyIds.length
        ? db.from('messages').select('id, kind, body, user_id, deleted_at').in('id', replyIds)
        : Promise.resolve({ data: [] }),
    ]);

  const { data: tails } = betIds.length
    ? await db.from('bet_tails').select('bet_id, user_id, stance').in('bet_id', betIds)
    : { data: [] };

  const cards = await loadCards(db, cardKeys);

  const authorOf = new Map<string, MessageAuthor>(
    ((profiles ?? []) as { user_id: string; username: string; avatar_url: string | null }[]).map(
      (p) => [p.user_id, { userId: p.user_id, username: p.username, avatarUrl: p.avatar_url }],
    ),
  );

  const tallies = new Map<string, Record<string, number>>();
  const mine = new Map<string, string[]>();
  for (const row of (reactions ?? []) as { message_id: string; user_id: string; emoji: string }[]) {
    const tally = tallies.get(row.message_id) ?? {};
    tally[row.emoji] = (tally[row.emoji] ?? 0) + 1;
    tallies.set(row.message_id, tally);
    if (row.user_id === userId) {
      mine.set(row.message_id, [...(mine.get(row.message_id) ?? []), row.emoji]);
    }
  }

  const stanceCount = new Map<string, { tails: number; fades: number; mine: Stance | null }>();
  for (const row of (tails ?? []) as { bet_id: string; user_id: string; stance: Stance }[]) {
    const entry = stanceCount.get(row.bet_id) ?? { tails: 0, fades: 0, mine: null };
    if (row.stance === 'tail') entry.tails += 1;
    else entry.fades += 1;
    if (row.user_id === userId) entry.mine = row.stance;
    stanceCount.set(row.bet_id, entry);
  }

  const betOf = new Map<string, SharedBetView>();
  for (const row of (bets ?? []) as Record<string, unknown>[]) {
    const id = row.id as string;
    const counts = stanceCount.get(id) ?? { tails: 0, fades: 0, mine: null };
    betOf.set(id, {
      id,
      ownerId: row.user_id as string,
      book: row.book as string,
      legs: normaliseLegs(row.legs),
      americanOdds: Number(row.american_odds),
      stake: row.stake === null ? null : Number(row.stake),
      note: (row.note as string) ?? null,
      result: (row.result as string) ?? 'pending',
      tails: counts.tails,
      fades: counts.fades,
      myStance: counts.mine,
    });
  }

  const replyOf = new Map<string, { id: string; author: string | null; excerpt: string }>();
  for (const row of (replies ?? []) as Record<string, unknown>[]) {
    const authorId = row.user_id as string | null;
    replyOf.set(row.id as string, {
      id: row.id as string,
      author: authorId ? (authorOf.get(authorId)?.username ?? null) : null,
      excerpt: excerpt({
        kind: row.kind as MessageKind,
        body: (row.body as string) ?? null,
        deleted: row.deleted_at !== null,
      }),
    });
  }

  return messages
    .map((row): ChatMessage => {
      const id = row.id as string;
      const authorId = row.user_id as string | null;
      const deleted = row.deleted_at !== null;
      const betId = row.bet_id as string | null;
      const replyId = row.reply_to_id as string | null;

      return {
        id,
        kind: row.kind as MessageKind,
        body: deleted ? null : ((row.body as string) ?? null),
        author: authorId ? (authorOf.get(authorId) ?? null) : null,
        createdAt: row.created_at as string,
        editedAt: (row.edited_at as string) ?? null,
        deleted,
        attachment:
          !deleted && row.attachment_url
            ? {
                url: row.attachment_url as string,
                type: (row.attachment_type as string) ?? null,
                width: (row.attachment_width as number) ?? null,
                height: (row.attachment_height as number) ?? null,
              }
            : null,
        bet: !deleted && betId ? (betOf.get(betId) ?? null) : null,
        card:
          !deleted && row.card_challenge_id && authorId
            ? (cards.get(`${row.card_challenge_id as string}:${authorId}`) ?? null)
            : null,
        replyTo: replyId ? (replyOf.get(replyId) ?? null) : null,
        reactions: tallies.get(id) ?? {},
        myReactions: mine.get(id) ?? [],
      };
    })
    .reverse();
}

/**
 * The cards behind any shared-card messages on the page.
 *
 * Three queries for the whole page, whatever it holds. The picks are read live
 * rather than from a copy stored on the message, which is what lets a card
 * posted on Thursday fill in with results through Sunday — see the note at the
 * top of migration 0016.
 *
 * Keyed by challenge AND author, because the same contest can be shared by
 * several people in the same channel and each of them posted a different card.
 */
async function loadCards(
  db: SupabaseClient,
  keys: readonly { challengeId: string; userId: string }[],
): Promise<Map<string, SharedCardView>> {
  const cards = new Map<string, SharedCardView>();
  if (keys.length === 0) return cards;

  const challengeIds = [...new Set(keys.map((k) => k.challengeId))];
  const userIds = [...new Set(keys.map((k) => k.userId))];

  const [{ data: challenges }, { data: picks }] = await Promise.all([
    db.from('pickem_challenges').select('id, season, week').in('id', challengeIds),
    db
      .from('picks')
      .select('challenge_id, user_id, game_id, market_type, selection, contest_line, contest_odds, result, points')
      .in('challenge_id', challengeIds)
      .in('user_id', userIds),
  ]);

  const pickRows = (picks ?? []) as Record<string, unknown>[];
  if (pickRows.length === 0) return cards;

  const gameIds = [...new Set(pickRows.map((p) => p.game_id as string))];
  const { data: games } = await db
    .from('nfl_games')
    .select('id, home_abbr, away_abbr, start_time')
    .in('id', gameIds);

  const gameOf = new Map(
    ((games ?? []) as { id: string; home_abbr: string; away_abbr: string; start_time: string }[]).map(
      (g) => [g.id, g],
    ),
  );
  const contestOf = new Map(
    ((challenges ?? []) as { id: string; season: number; week: number }[]).map((c) => [c.id, c]),
  );

  for (const row of pickRows) {
    const challengeId = row.challenge_id as string;
    const userId = row.user_id as string;
    const contest = contestOf.get(challengeId);
    const game = gameOf.get(row.game_id as string);
    if (!contest || !game) continue;

    const key = `${challengeId}:${userId}`;
    const card =
      cards.get(key) ??
      { season: contest.season, week: contest.week, picks: [], earned: 0, atStake: 0, graded: 0 };

    const result = (row.result as string) ?? 'pending';
    const odds = row.contest_odds === null ? null : Number(row.contest_odds);
    const line = row.contest_line === null ? null : Number(row.contest_line);

    card.picks.push({
      label: describePick(row.market_type as string, row.selection as string, game, line, 'short'),
      matchup: `${game.away_abbr} @ ${game.home_abbr}`,
      points: pointsForOdds(odds),
      result,
      kickoff: game.start_time,
    });

    if (result === 'pending') {
      card.atStake += pointsForOdds(odds);
    } else {
      card.graded += 1;
      card.earned += Number(row.points) || 0;
    }

    cards.set(key, card);
  }

  for (const card of cards.values()) {
    // Kickoff order, so a shared card reads like the slate rather than like
    // whatever order the rows happened to come back in.
    card.picks.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    card.earned = Math.round(card.earned);
    card.atStake = Math.round(card.atStake);
  }

  return cards;
}

/**
 * Legs out of jsonb.
 *
 * Anything stored is trusted to be the right shape by the time it is written,
 * but a slip that renders as [object Object] because one field was a number is
 * worse than a slip with one leg missing, so every field is coerced.
 */
function normaliseLegs(value: unknown): BetLeg[] {
  if (!Array.isArray(value)) return [];
  const legs: BetLeg[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const leg = entry as Record<string, unknown>;
    const description = typeof leg.description === 'string' ? leg.description : '';
    if (!description) continue;
    const odds = Number(leg.americanOdds);
    legs.push({
      description,
      americanOdds: Number.isFinite(odds) && odds !== 0 ? odds : null,
    });
  }
  return legs;
}
