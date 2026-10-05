// Display formatting.

const ET = 'America/New_York';

/** American odds with an explicit sign, as a book would print them. */
export function formatOdds(american: number | null | undefined): string {
  if (american === null || american === undefined || !Number.isFinite(american)) return '—';
  return american > 0 ? `+${american}` : String(american);
}

/** A spread from the picked side's perspective; +0 reads as "PK". */
export function formatSpread(line: number | null | undefined): string {
  if (line === null || line === undefined || !Number.isFinite(line)) return '—';
  if (line === 0) return 'PK';
  return line > 0 ? `+${line}` : String(line);
}

export function formatTotal(line: number | null | undefined, side: 'over' | 'under'): string {
  if (line === null || line === undefined || !Number.isFinite(line)) return '—';
  return `${side === 'over' ? 'O' : 'U'} ${line}`;
}

/** Kickoff as the day and time a US viewer expects, in Eastern. */
export function formatKickoff(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/** A compact countdown: "2d 4h", "3h 12m", "8m". */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Locked';

  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${Math.max(1, minutes)}m`;
}

export function formatRecord(wins: number, losses: number, pushes = 0): string {
  return pushes > 0 ? `${wins}-${losses}-${pushes}` : `${wins}-${losses}`;
}

/** Points with no trailing zeroes: 5, 5.5, 0. */
export function formatPoints(points: number): string {
  if (!Number.isFinite(points)) return '0';
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

export const RESULT_TONE: Record<string, string> = {
  win: 'text-win',
  loss: 'text-loss',
  push: 'text-push',
  pending: 'text-muted',
};

export const RESULT_LABEL: Record<string, string> = {
  win: 'Won',
  loss: 'Lost',
  push: 'Push',
  pending: 'Pending',
};

/** Clock time for a chat message: "9:42 PM", in the reader's own zone. */
export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}

/**
 * The divider between days in a conversation.
 *
 * "Today" and "Yesterday" rather than a date, because that is how people
 * actually refer to the last two days of a thread.
 */
export function formatDayDivider(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const startOf = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();

  const days = Math.round((startOf(new Date()) - startOf(date)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) {
    return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date);
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date);
}

/** True when two timestamps fall on different calendar days. */
export function isDifferentDay(a: string, b: string): boolean {
  const first = new Date(a);
  const second = new Date(b);
  if (Number.isNaN(first.getTime()) || Number.isNaN(second.getTime())) return false;
  return (
    first.getFullYear() !== second.getFullYear() ||
    first.getMonth() !== second.getMonth() ||
    first.getDate() !== second.getDate()
  );
}

/** "now", "4m", "2h", "3d" — for a channel list or an activity row. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return 'now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  if (seconds < 604_800) return `${Math.round(seconds / 86_400)}d`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
}
