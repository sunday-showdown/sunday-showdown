'use client';

import { useState } from 'react';
import Link from 'next/link';
import Avatar from './Avatar';
import BetSlipCard from './BetSlipCard';
import PickCardMessage from './PickCardMessage';
import { formatMessageTime } from '@/lib/format';
import { QUICK_REACTIONS, type ChatMessage } from '@/lib/chat';

/**
 * One message.
 *
 * Grouped the way Discord groups: consecutive messages from the same person
 * within a few minutes drop the avatar and the name, which is what stops a
 * back-and-forth turning into a wall of repeated headers.
 *
 * Actions open on tap rather than long-press. A long-press on the web is a
 * context menu on some phones and a text selection on others; a tap is a tap
 * everywhere, and the row it opens is reachable without a second gesture.
 */
export default function MessageBubble({
  message,
  isMine,
  grouped,
  onReact,
  onReply,
  onDelete,
  onChanged,
}: {
  message: ChatMessage;
  isMine: boolean;
  grouped: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const name = message.author?.username ?? 'Someone';

  if (message.kind === 'system') {
    return (
      <div className="px-4 py-1.5 text-center text-[11px] text-muted">{message.body}</div>
    );
  }

  return (
    <div className={`px-3 ${grouped ? 'mt-0.5' : 'mt-3'}`}>
      <div className="flex items-start gap-2.5">
        <div className="w-[34px] shrink-0">
          {!grouped &&
            (message.author ? (
              <Link href={`/u/${message.author.userId}`} aria-label={name}>
                <Avatar username={name} url={message.author.avatarUrl} size="md" />
              </Link>
            ) : (
              <Avatar username="?" size="md" />
            ))}
        </div>

        <div className="min-w-0 flex-1">
          {!grouped && (
            <div className="flex items-baseline gap-2">
              <span className={`text-[13px] font-bold ${isMine ? 'text-brand' : 'text-ink'}`}>
                {name}
              </span>
              <span className="text-[10px] text-muted">{formatMessageTime(message.createdAt)}</span>
            </div>
          )}

          {message.replyTo && (
            <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted">
              <span aria-hidden="true" className="text-line">
                ↳
              </span>
              <span className="font-semibold">{message.replyTo.author ?? 'Someone'}</span>
              <span className="min-w-0 truncate">{message.replyTo.excerpt}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowActions((open) => !open)}
            aria-expanded={showActions}
            aria-label="Message actions"
            className="block w-full text-left"
          >
            {message.deleted ? (
              <p className="text-[14px] italic text-muted">Message deleted</p>
            ) : (
              <>
                {message.body && (
                  <p className="whitespace-pre-wrap break-words text-[14.5px] leading-[1.45]">
                    <Mentions text={message.body} />
                    {message.editedAt && (
                      <span className="ml-1.5 align-baseline text-[10px] text-muted">edited</span>
                    )}
                  </p>
                )}

                {message.attachment && (
                  <span className="mt-1 block overflow-hidden rounded-xl border border-line bg-raised">
                    {/* eslint-disable-next-line @next/next/no-img-element --
                        attachments are bucket or Tenor URLs, allowlisted in
                        lib/attachments.ts; next/image would proxy every GIF
                        frame through the server. */}
                    <img
                      src={message.attachment.url}
                      alt={message.body ?? 'Attachment'}
                      loading="lazy"
                      // Both dimensions are read from the file on upload, so the
                      // box is the right shape before the bytes arrive and the
                      // conversation does not jump as images load.
                      width={message.attachment.width ?? undefined}
                      height={message.attachment.height ?? undefined}
                      className="block h-auto max-h-[320px] w-full max-w-[260px] object-contain"
                    />
                  </span>
                )}
              </>
            )}
          </button>

          {message.bet && (
            <div className="mt-1.5 max-w-[300px]">
              <BetSlipCard bet={message.bet} isMine={isMine} onChanged={onChanged} />
            </div>
          )}

          {message.card && (
            <div className="mt-1.5 max-w-[300px]">
              <PickCardMessage card={message.card} />
            </div>
          )}

          {Object.keys(message.reactions).length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {Object.entries(message.reactions).map(([emoji, count]) => {
                const mine = message.myReactions.includes(emoji);
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => onReact(emoji)}
                    aria-pressed={mine}
                    aria-label={`${emoji} ${count}`}
                    className={`flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-bold transition-colors ${
                      mine ? 'border-brand/60 bg-brand/15 text-brand' : 'border-line bg-raised text-muted'
                    }`}
                  >
                    <span aria-hidden="true">{emoji}</span>
                    <span className="tabnum">{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {showActions && !message.deleted && (
            <div className="mt-1.5 flex animate-pop-in flex-wrap items-center gap-1 rounded-xl border border-line bg-raised p-1">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onReact(emoji);
                    setShowActions(false);
                  }}
                  aria-label={`React ${emoji}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[17px] active:bg-line/60"
                >
                  {emoji}
                </button>
              ))}

              <span className="mx-0.5 h-5 w-px bg-line" />

              <button
                type="button"
                onClick={() => {
                  onReply();
                  setShowActions(false);
                }}
                className="h-8 rounded-lg px-2.5 text-[11px] font-bold text-muted active:bg-line/60"
              >
                Reply
              </button>

              {isMine && (
                <button
                  type="button"
                  onClick={() => {
                    onDelete();
                    setShowActions(false);
                  }}
                  className="h-8 rounded-lg px-2.5 text-[11px] font-bold text-loss active:bg-line/60"
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * @names, highlighted.
 *
 * Rendered from the text rather than from a stored list of mentions: a name is
 * highlighted because it looks like a mention, and whether it reached anybody
 * is the notification's business, not the bubble's.
 */
function Mentions({ text }: { text: string }) {
  const parts = text.split(/(@[A-Za-z0-9_]{3,24})/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith('@') ? (
          <span key={index} className="rounded bg-brand/15 px-1 font-semibold text-brand">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
