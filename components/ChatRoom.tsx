'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import MessageBubble from './MessageBubble';
import Composer from './Composer';
import { createClient } from '@/lib/supabase/client';
import { formatDayDivider, isDifferentDay } from '@/lib/format';
import { MESSAGE_PAGE, type ChatMessage } from '@/lib/chat';

/** Consecutive messages from one person inside this window are grouped. */
const GROUP_WINDOW_MS = 5 * 60_000;

interface Props {
  channelId: string;
  leagueId: string | null;
  myUserId: string;
  placeholder: string;
  initialMessages: ChatMessage[];
}

/**
 * A channel, live.
 *
 * Realtime carries the fact that something changed; the refetch carries what it
 * is. That split is deliberate — a Postgres change event gives the raw row,
 * which has no author name, no reaction tallies and no bet slip attached, so
 * rendering from it directly would mean rebuilding half of lib/chat.ts in the
 * browser and getting a different answer than the server does. Instead an event
 * triggers one debounced reload of the newest page, which is correct by
 * construction and, at the volume a group chat actually runs at, cheaper than
 * the per-message joins would be.
 *
 * Scrolling follows the rule every chat app settled on: stay pinned to the
 * bottom while you are at the bottom, and never yank the view when a message
 * arrives while somebody is reading back through history.
 */
export default function ChatRoom({
  channelId,
  leagueId,
  myUserId,
  placeholder,
  initialMessages,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [replyTo, setReplyTo] = useState<ChatMessage['replyTo']>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // A first page that came back short is the whole history, so there is no
  // "Earlier messages" button to offer. Only checking for zero put the button
  // above every young channel, where it did nothing.
  const [exhausted, setExhausted] = useState(initialMessages.length < MESSAGE_PAGE);

  const bottom = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownIds = useRef(new Set(initialMessages.map((m) => m.id)));

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/messages?channel=${encodeURIComponent(channelId)}`);
      if (!response.ok) return;
      const payload = (await response.json()) as { messages?: ChatMessage[] };
      const fresh = payload.messages ?? [];
      if (fresh.length === 0) return;

      setMessages((current) => {
        // Keep anything older than this page, so a reload does not throw away
        // history somebody has already scrolled back through.
        const oldest = fresh[0]!.createdAt;
        const kept = current.filter((message) => message.createdAt < oldest);
        return [...kept, ...fresh];
      });

      for (const message of fresh) knownIds.current.add(message.id);
    } catch {
      // Offline, or the tab is being closed. The next event tries again.
    }
  }, [channelId]);

  /** Collapse a burst of events into one reload. */
  const scheduleRefresh = useCallback(() => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      pending.current = null;
      void refresh();
    }, 220);
  }, [refresh]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`room:${channelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        (payload) => {
          // Reactions cannot be filtered by channel server-side, so ignore the
          // ones that belong to messages this room is not showing.
          const row = (payload.new ?? payload.old) as { message_id?: string } | null;
          if (row?.message_id && knownIds.current.has(row.message_id)) scheduleRefresh();
        },
      )
      .subscribe();

    return () => {
      if (pending.current) clearTimeout(pending.current);
      void supabase.removeChannel(channel);
    };
  }, [channelId, scheduleRefresh]);

  // Mark the room read on arrival and whenever something new lands while it is
  // open, so the badge does not come back for messages already on screen.
  useEffect(() => {
    void fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markRead', channelId }),
    });
  }, [channelId, messages.length]);

  // Follow the bottom only when the reader is already there.
  useEffect(() => {
    if (atBottom.current) {
      bottom.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages]);

  useEffect(() => {
    const onScroll = () => {
      const fromBottom =
        document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      atBottom.current = fromBottom < 140;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const loadOlder = async () => {
    const first = messages[0];
    if (!first || loadingOlder || exhausted) return;

    setLoadingOlder(true);
    const previousHeight = document.documentElement.scrollHeight;

    try {
      const response = await fetch(
        `/api/messages?channel=${encodeURIComponent(channelId)}&before=${encodeURIComponent(first.createdAt)}`,
      );
      if (!response.ok) return;

      const payload = (await response.json()) as { messages?: ChatMessage[] };
      const older = payload.messages ?? [];

      if (older.length === 0) {
        setExhausted(true);
        return;
      }

      for (const message of older) knownIds.current.add(message.id);
      setMessages((current) => [...older, ...current]);

      // Hold the reader's place: prepending content would otherwise shove what
      // they were reading down the page by the height of everything added.
      requestAnimationFrame(() => {
        window.scrollBy({ top: document.documentElement.scrollHeight - previousHeight });
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  const react = async (messageId: string, emoji: string) => {
    // Optimistic, then reconciled by the realtime event this causes.
    setMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId) return message;
        const mine = message.myReactions.includes(emoji);
        const tally = { ...message.reactions };
        const next = (tally[emoji] ?? 0) + (mine ? -1 : 1);
        if (next <= 0) delete tally[emoji];
        else tally[emoji] = next;

        return {
          ...message,
          reactions: tally,
          myReactions: mine
            ? message.myReactions.filter((value) => value !== emoji)
            : [...message.myReactions, emoji],
        };
      }),
    );

    try {
      await fetch('/api/messages/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, emoji }),
      });
    } catch {
      void refresh();
    }
  };

  const remove = async (messageId: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, deleted: true, body: null, attachment: null, bet: null }
          : message,
      ),
    );
    await fetch(`/api/messages?id=${encodeURIComponent(messageId)}`, { method: 'DELETE' });
  };

  return (
    <>
      {/* pb-28 clears the fixed composer. */}
      <div className="pb-28">
        {messages.length === 0 ? (
          <div className="px-8 py-16 text-center">
            <div className="display text-[20px] leading-tight">Nothing here yet</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Say something. Pictures, GIFs and bet slips all work.
            </p>
          </div>
        ) : (
          <>
            {!exhausted && (
              <div className="px-4 py-3 text-center">
                <button
                  type="button"
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="btn-ghost h-9 px-4 text-[12px]"
                >
                  {loadingOlder ? 'Loading…' : 'Earlier messages'}
                </button>
              </div>
            )}

            {messages.map((message, index) => {
              const previous = index > 0 ? messages[index - 1] : undefined;
              const newDay = !previous || isDifferentDay(previous.createdAt, message.createdAt);
              const grouped =
                !newDay &&
                previous !== undefined &&
                previous.kind !== 'system' &&
                message.kind !== 'system' &&
                previous.author?.userId === message.author?.userId &&
                message.author !== null &&
                new Date(message.createdAt).getTime() -
                  new Date(previous.createdAt).getTime() <
                  GROUP_WINDOW_MS;

              return (
                <div key={message.id}>
                  {newDay && (
                    <div className="flex items-center gap-3 px-4 pb-1 pt-5">
                      <span className="h-px flex-1 bg-line" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                        {formatDayDivider(message.createdAt)}
                      </span>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                  )}

                  <MessageBubble
                    message={message}
                    isMine={message.author?.userId === myUserId}
                    grouped={grouped}
                    onReact={(emoji) => void react(message.id, emoji)}
                    onReply={() =>
                      setReplyTo({
                        id: message.id,
                        author: message.author?.username ?? null,
                        excerpt:
                          message.body?.slice(0, 70) ??
                          (message.kind === 'image' ? '📷 Image' : '🎟️ Bet slip'),
                      })
                    }
                    onDelete={() => void remove(message.id)}
                    onChanged={() => void refresh()}
                  />
                </div>
              );
            })}
          </>
        )}

        <div ref={bottom} />
      </div>

      <Composer
        channelId={channelId}
        leagueId={leagueId}
        placeholder={placeholder}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSent={() => {
          atBottom.current = true;
          void refresh();
        }}
      />
    </>
  );
}
