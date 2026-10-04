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
