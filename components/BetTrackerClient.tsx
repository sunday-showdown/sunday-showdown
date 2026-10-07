'use client';

import { useRouter } from 'next/navigation';
import BetTracker from './BetTracker';
import type { TrackedBet } from '@/lib/betStats';

/**
 * Hands the tracker a way to reload.
 *
 * The page is a server component so the arithmetic runs against fresh rows on
 * every visit; this is the thin client boundary that lets a settle or a new bet
 * ask for those rows again.
 */
export default function BetTrackerClient({
  bets,
  unitSize,
  preferredBooks,
}: {
  bets: readonly TrackedBet[];
  unitSize: number;
  preferredBooks?: readonly string[];
}) {
  const router = useRouter();
  return (
    <BetTracker
      bets={bets}
      unitSize={unitSize}
      preferredBooks={preferredBooks}
      onChanged={() => router.refresh()}
    />
  );
}
