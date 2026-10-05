// Image and GIF uploads for chat.
//
// The bucket is public to read and not writable by anyone but the service role,
// so this route is the only way a file gets in — which is the point. It is
// where the size cap and the magic-byte check live, and a browser-side upload
// policy would put both somewhere a client can simply not run.
//
// Files are stored under the uploader's id. That is not an access control (the
// bucket is public), it is so a person's uploads can be found and removed if
// they ever ask.

import { createServerSupabase, getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inspectImage, EXTENSION } from '@/lib/images';

export const dynamic = 'force-dynamic';

const BUCKET = 'chat-media';
/** 8 MB. A phone photo is 3-5; a long reaction GIF can be 6. */
const MAX_BYTES = 8 * 1024 * 1024;
/** Uploads per person per window, so a stuck client cannot fill the bucket. */
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'Send the file as form data.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'No file was attached.' }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: 'That file is empty.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `That file is ${Math.round(file.size / 1_048_576)}MB. The limit is 8MB.` },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = inspectImage(bytes);
  if (!image) {
    // Declared type is deliberately not consulted — see lib/images.ts.
    return Response.json(
      { error: 'That is not a PNG, JPEG, GIF or WebP.' },
      { status: 415 },
    );
  }

  // Rate limit by what has already been sent, which is the thing that would
  // actually fill the bucket.
  const supabase = await createServerSupabase();
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count: recent } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('kind', 'image')
    .gt('created_at', since);

  if ((recent ?? 0) >= RATE_LIMIT) {
    return Response.json({ error: 'That is a lot of images. Give it a minute.' }, { status: 429 });
  }

  const path = `${user.id}/${crypto.randomUUID()}.${EXTENSION[image.format]}`;

  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: image.mimeType,
    // One year: the path contains a fresh uuid, so a file at a path never
    // changes and the cache can never be stale.
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) {
    return Response.json(
      { error: 'Could not store that image. Try again in a moment.' },
      { status: 502 },
    );
  }

  const {
    data: { publicUrl },
  } = admin.storage.from(BUCKET).getPublicUrl(path);

  return Response.json({
    ok: true,
    url: publicUrl,
    type: image.mimeType,
    width: image.width,
    height: image.height,
    animated: image.animated,
  });
}
