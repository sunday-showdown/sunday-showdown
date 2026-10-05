/**
 * The public VAPID key, under either name.
 *
 * `VAPID_PUBLIC_KEY` is correct — the value is read server-side and handed to
 * the browser as a prop, so it never needed the NEXT_PUBLIC_ prefix that
 * inlines a value into the client bundle. But the prefixed name was the first
 * instruction given, and Vercel refuses that prefix on a variable marked
 * sensitive. Accepting both means a working deployment does not hinge on which
 * name happens to be set.
 *
 * Server-only: both are plain environment reads.
 */
export function publicVapidKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}
