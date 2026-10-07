'use client';

import { useRef, useState } from 'react';
import GifPicker, { type PickedGif } from './GifPicker';
import BetSlipComposer from './BetSlipComposer';
import { MAX_BODY } from '@/lib/chat';

interface Props {
  channelId: string;
  leagueId: string | null;
  placeholder: string;
  replyTo: { id: string; author: string | null; excerpt: string } | null;
  onCancelReply: () => void;
  onSent: () => void;
  /** Slips and cards only: no text, no replies. See migration 0034. */
  playsOnly?: boolean;
  /** This league's open contest, so a plays room can post the week's card. */
  cardChallengeId?: string | null;
}

/**
 * The message box.
 *
 * Pinned to the bottom of the viewport with the home indicator accounted for,
 * because a composer that scrolls with the conversation is a composer you have
 * to go and find.
 *
 * The textarea grows to a ceiling rather than scrolling from the first line,
 * and Enter sends while Shift+Enter breaks the line — on a phone the Return key
 * is the send key, which is what people expect from every other chat app.
 */
export default function Composer({
  channelId,
  leagueId,
  placeholder,
  replyTo,
  onCancelReply,
  onSent,
  playsOnly = false,
  cardChallengeId = null,
}: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [gifOpen, setGifOpen] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  /** Put this week's card in the room. The same call ShareCardButton makes. */
  const postCard = async (challengeId: string) => {
    setSending(true);
    setError('');
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, kind: 'pick_card', challengeId }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setError(result?.error ?? 'That did not post.');
        return;
      }
      onSent();
    } catch {
      setError('Network error.');
    } finally {
      setSending(false);
    }
  };

  const resize = () => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 132)}px`;
  };

  const post = async (payload: Record<string, unknown>) => {
    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId, replyToId: replyTo?.id ?? null, ...payload }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error ?? 'That did not send.');
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;

    setSending(true);
    setError('');
    // Cleared before the request, so the box is empty immediately and a slow
    // network cannot result in the same message being sent twice.
    setText('');
    requestAnimationFrame(resize);

    try {
      await post({ body, kind: 'text' });
      setTrayOpen(false);
      onCancelReply();
      onSent();
    } catch (sendError) {
      setText(body);
      setError(sendError instanceof Error ? sendError.message : 'That did not send.');
    } finally {
      setSending(false);
    }
  };

  const attach = async (file: File) => {
    setUploading(true);
    setError('');

    try {
      const form = new FormData();
      form.append('file', file);

      const response = await fetch('/api/uploads', { method: 'POST', body: form });
      const result = (await response.json()) as {
        error?: string;
        url?: string;
        type?: string;
        width?: number | null;
        height?: number | null;
      };

      if (!response.ok || !result.url) {
        setError(result.error ?? 'That image did not upload.');
        return;
      }

      await post({
        kind: 'image',
        body: text.trim() || null,
        attachmentUrl: result.url,
        attachmentType: result.type,
        attachmentWidth: result.width,
        attachmentHeight: result.height,
      });

      setText('');
      requestAnimationFrame(resize);
      onCancelReply();
      onSent();
    } catch {
      setError('That image did not upload.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const sendGif = async (gif: PickedGif) => {
    setUploading(true);
    setError('');
    try {
      await post({
        kind: 'image',
        attachmentUrl: gif.url,
        attachmentType: 'image/gif',
        attachmentWidth: gif.width,
        attachmentHeight: gif.height,
      });
      onCancelReply();
      onSent();
    } catch (gifError) {
      setError(gifError instanceof Error ? gifError.message : 'That GIF did not send.');
    } finally {
      setUploading(false);
    }
  };

  const busy = sending || uploading;

  // A plays room takes positions, not sentences. The text box is not disabled
  // here, it is absent: a greyed-out field invites people to work out why, and
  // the only two things that may be posted are worth being the only two things
  // on offer. The database refuses anything else regardless (migration 0034).
  if (playsOnly) {
    return (
      <>
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-xl"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto max-w-md px-3 pt-2.5">
            {error && (
              <p role="alert" className="mb-1.5 rounded-xl bg-loss/15 px-3 py-1.5 text-[11px] text-loss">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSlipOpen(true)}
                className="btn-primary h-11 flex-1 text-[14px]"
              >
                Post a slip
              </button>
              {cardChallengeId && (
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => void postCard(cardChallengeId)}
                  className="btn-ghost h-11 flex-1 text-[14px]"
                >
                  {sending ? 'Posting…' : 'Post your card'}
                </button>
              )}
            </div>
            <p className="pb-1 pt-1.5 text-center text-[10px] text-muted">
              Plays only. React to them — the talking goes in Trash Talk.
            </p>
          </div>
        </div>

        <BetSlipComposer
          open={slipOpen}
          onClose={() => setSlipOpen(false)}
          channelId={channelId}
          leagueId={leagueId}
          onShared={() => {
            setSlipOpen(false);
            onSent();
          }}
        />
      </>
    );
  }

  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-xl"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto max-w-md px-2 pt-2">
          {replyTo && (
            <div className="mb-1.5 flex items-center gap-2 rounded-xl border border-line bg-raised px-3 py-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
                Replying to {replyTo.author ?? 'someone'}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                {replyTo.excerpt}
              </span>
              <button
                type="button"
                onClick={onCancelReply}
                aria-label="Cancel reply"
                className="shrink-0 text-muted active:text-ink"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="mb-1.5 rounded-xl bg-loss/15 px-3 py-1.5 text-[11px] text-loss">
              {error}
            </p>
          )}

          {/* One button rather than three in the row. Three 44pt targets plus
              the send button left about 170px for the text box on a 375px
              phone, which was narrow enough that the placeholder wrapped onto
              a second line. The tray also lets each action carry a label. */}
          {trayOpen && (
            <div className="mb-1.5 flex animate-pop-in gap-1.5">
              <TrayAction
                label="Photo"
                disabled={busy}
                onClick={() => {
                  setTrayOpen(false);
                  fileInput.current?.click();
                }}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3.25" y="5.25" width="17.5" height="13.5" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
                  <circle cx="8.75" cy="9.75" r="1.5" fill="currentColor" />
                  <path d="m4 16.5 4.5-4 4 3.5 3.5-3 4 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                </svg>
              </TrayAction>

              <TrayAction
                label="GIF"
                disabled={busy}
                onClick={() => {
                  setTrayOpen(false);
                  setGifOpen(true);
                }}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3.25" y="5.25" width="17.5" height="13.5" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
                  <path
                    d="M10.5 10.2a2 2 0 1 0 0 3.6h.9v-1.4"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M13.9 9.9v4.2M15.9 9.9h2.1M15.9 12h1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </TrayAction>

              {leagueId && (
                <TrayAction
                  label="Bet slip"
                  disabled={busy}
                  onClick={() => {
                    setTrayOpen(false);
                    setSlipOpen(true);
                  }}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M3.5 7.5A1.5 1.5 0 0 1 5 6h14a1.5 1.5 0 0 1 1.5 1.5v2a2.5 2.5 0 0 0 0 5v2A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5v-2a2.5 2.5 0 0 0 0-5z"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                    <path d="M9.5 10.5h5M9.5 13.5h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </TrayAction>
              )}
            </div>
          )}

          <div className="flex items-end gap-1.5">
            <button
              type="button"
              onClick={() => setTrayOpen((open) => !open)}
              disabled={busy}
              aria-expanded={trayOpen}
              aria-label={trayOpen ? 'Hide attachments' : 'Add an attachment'}
              className="tap flex shrink-0 items-center justify-center rounded-xl text-muted active:bg-raised disabled:opacity-50"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className={`transition-transform duration-200 ${trayOpen ? 'rotate-45 text-brand' : ''}`}
              >
                <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.7" />
                <path d="M12 7.75v8.5M7.75 12h8.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
            </button>

            <textarea
              ref={textarea}
              value={text}
              onChange={(event) => {
                setText(event.target.value.slice(0, MAX_BODY));
                resize();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder={placeholder}
              aria-label="Message"
              className="field min-h-[44px] flex-1 resize-none py-[11px] leading-snug"
            />

            <button
              type="button"
              onClick={send}
              disabled={!text.trim() || busy}
              aria-label="Send"
              className="btn-primary h-11 w-11 shrink-0 rounded-xl p-0"
            >
              {busy ? (
                <span className="text-[11px] font-bold">…</span>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M4 11.5 20 4l-7.5 16-1.75-6.75z"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void attach(file);
          }}
        />
      </div>

      <GifPicker open={gifOpen} onClose={() => setGifOpen(false)} onPick={(gif) => void sendGif(gif)} />

      {leagueId && (
        <BetSlipComposer
          open={slipOpen}
          onClose={() => setSlipOpen(false)}
          channelId={channelId}
          leagueId={leagueId}
          onShared={onSent}
        />
      )}
    </>
  );
}

function TrayAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-raised text-[11px] font-bold text-ink active:bg-line/50 disabled:opacity-50"
    >
      {children}
      {label}
    </button>
  );
}
