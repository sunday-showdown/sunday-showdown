/**
 * What a screen looks like while it is being fetched.
 *
 * Every route in this group is `force-dynamic` and does real database work, so
 * a tab can take a second or more to answer. Without this, Next holds the
 * previous screen on display for that whole time and the app reads as frozen —
 * you tap Ranks, nothing happens, you tap it again.
 *
 * Deliberately generic: a shape, not a mock of any particular screen. A
 * skeleton that pretends to be the page it is replacing is worse than an
 * obviously-loading one, because the layout shifts when the real content
 * arrives and is a different size.
 */
export default function Loading() {
  return (
    <main className="px-4 pt-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <div className="h-7 w-32 animate-pulse rounded-lg bg-raised" />
      <div className="mt-2 h-3.5 w-24 animate-pulse rounded bg-raised/70" />

      <div className="mt-6 space-y-2.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="card h-[108px] animate-pulse"
            // Staggered, so the three do not pulse as one block — which reads
            // as a rendering glitch rather than as waiting.
            style={{ animationDelay: `${i * 120}ms`, opacity: 1 - i * 0.22 }}
          />
        ))}
      </div>
    </main>
  );
}
