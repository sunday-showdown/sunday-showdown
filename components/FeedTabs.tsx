'use client';

import { useState } from 'react';
import ActivityItem, { type FeedItem } from './ActivityItem';

/**
 * League and friends views of the same feed.
 *
 * Friends is a filter rather than a separate source: activity is readable only
 * within leagues you belong to, so showing a friend's result from a league you
 * are not in would mean loosening that. Filtering keeps the privacy model
 * intact and still answers "what did my people do".
 */
export default function FeedTabs({
  league,
  friends,
  friendCount,
}: {
  league: readonly FeedItem[];
  friends: readonly FeedItem[];
  friendCount: number;
}) {
  const [tab, setTab] = useState<'league' | 'friends'>('league');
  const items = tab === 'league' ? league : friends;

  return (
    <>
      <div className="flex gap-1.5 px-4 pb-3">
        {(['league', 'friends'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-pressed={tab === value}
            className={`display h-9 flex-1 rounded-xl text-[13px] leading-none transition-colors ${
              tab === value ? 'bg-brand text-brand-ink' : 'bg-raised text-muted'
            }`}
          >
            {value === 'league' ? 'League' : `Friends${friendCount > 0 ? ` · ${friendCount}` : ''}`}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="card mx-4 px-6 py-10 text-center">
          <h2 className="display text-[19px] leading-none">
            {tab === 'league' ? 'Nothing yet' : 'No friend activity'}
          </h2>
          <p className="mx-auto mt-2.5 max-w-xs text-sm leading-relaxed text-muted">
            {tab === 'league'
              ? 'Once a week is graded, winners, upsets and streaks show up here automatically.'
              : friendCount === 0
                ? 'Follow some people and anything they do in your leagues lands here.'
                : 'Your friends have not done anything worth reporting yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 px-4">
          {items.map((item) => (
            <ActivityItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}
