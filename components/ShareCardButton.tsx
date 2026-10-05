'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Sheet from './Sheet';
import { useSaveImage } from './SaveImageButton';
import { renderCardImage, cardImageName, type CardImageInput } from '@/lib/cardImage';
import type { ChannelSummary } from '@/lib/chat';

/**
 * Put your week's card in a channel.
 *
 * The loop this closes: you finish a card, you show it, the league reacts to
 * it, and then it keeps scoring itself in the chat all Sunday because the
 * message holds the contest rather than a copy of the picks. Posting a card
 * nobody can needle you about is a screenshot; this is the needling.
 *
 * It asks which room rather than always using #general, because a card posted
 * in trash-talk is a different act from one posted in the main channel.
 *
 * The same sheet saves the card as a picture, for the group chats and the
 * stories this app is not in.
 */
export default function ShareCardButton({
  challengeId,
  channels,
  pickCount,
  image,
}: {
  challengeId: string;
  channels: readonly ChannelSummary[];
  pickCount: number;
  image: CardImageInput;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const { save, busy: saving, error: saveError } = useSaveImage();

  const rooms = channels.filter((channel) => channel.kind !== 'dm');
  // The picture is worth offering even with nowhere to post it, but a card with
  // no picks on it is not worth either.
  if (pickCount === 0) return null;

  const share = async (channelId: string) => {
    setBusy(channelId);
    setError('');

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, kind: 'pick_card', challengeId }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(result.error ?? 'That did not post.');
        return;
      }

      setOpen(false);
      router.push(`/feed/c/${channelId}`);
    } catch {
      setError('Network error.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="card flex w-full items-center gap-3 px-4 py-3 text-left active:bg-raised"
        >
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-[16px]"
          >
            🗒️
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted">
              Show your work
            </div>
            <div className="mt-0.5 text-[13.5px] font-bold">
              Share your card, or save it as a picture
            </div>
          </div>
          <span className="shrink-0 text-muted">›</span>
        </button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Share your card">
        <p className="pb-3 text-[12.5px] leading-relaxed text-muted">
          It posts as a live card — {pickCount} pick{pickCount === 1 ? '' : 's'} that fill in with
          wins and losses as the week grades.
        </p>

        {(error || saveError) && (
          <p role="alert" className="mb-3 rounded-xl bg-loss/15 px-3 py-2 text-[12px] text-loss">
            {error || saveError}
          </p>
        )}

        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            const blob = await renderCardImage(image);
            await save(blob, cardImageName(image.username, image.week));
          }}
          className="card mb-3 flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-raised disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-win/15 text-[16px]"
          >
            🖼️
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold">Save as a picture</div>
            <div className="text-[11px] text-muted">
              {saving ? 'Drawing it…' : 'For Instagram, iMessage, anywhere else'}
            </div>
          </div>
          <span className="shrink-0 text-muted">›</span>
        </button>

        {rooms.length > 0 && <h3 className="eyebrow pb-2">Post to a channel</h3>}

        <div className="space-y-1.5 pb-3">
          {rooms.map((channel) => (
            <button
              key={channel.id}
              type="button"
              disabled={busy !== null}
              onClick={() => void share(channel.id)}
              className="card flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-raised disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-raised text-[16px]"
              >
                {channel.emoji ?? '💬'}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{channel.name}</span>
              <span className="shrink-0 text-[11px] font-bold text-brand">
                {busy === channel.id ? '…' : 'Post'}
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
