'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Avatar from './Avatar';

/**
 * Your picture.
 *
 * It shows next to every message you send, which is the real reason to have
 * one: a channel of initials is readable, a channel of faces is scannable. The
 * fallback stays deterministic from the username, so somebody who never
 * uploads anything is still the same colour everywhere.
 */
export default function AvatarUpload({
  username,
  avatarUrl,
}: {
  username: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(avatarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const upload = async (file: File) => {
    setBusy(true);
    setError('');

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('purpose', 'avatar');

      const response = await fetch('/api/uploads', { method: 'POST', body: form });
      const result = (await response.json()) as { error?: string; url?: string };

      if (!response.ok || !result.url) {
        setError(result.error ?? 'That picture did not upload.');
        return;
      }
      setUrl(result.url);
      router.refresh();
    } catch {
      setError('That picture did not upload.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <section className="px-4 pb-3">
      <div className="card flex items-center gap-3.5 px-4 py-3.5">
        <Avatar username={username} url={url} size="lg" />

        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold">Your picture</div>
          <div className="mt-0.5 text-[11.5px] leading-snug text-muted">
            Appears next to your name in every channel.
          </div>
          {error && <p className="mt-1 text-[11px] text-loss">{error}</p>}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="h-9 shrink-0 rounded-xl border border-line bg-raised px-3.5 text-[12px] font-bold active:bg-line/50 disabled:opacity-60"
        >
          {busy ? '…' : url ? 'Change' : 'Add'}
        </button>

        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
    </section>
  );
}
