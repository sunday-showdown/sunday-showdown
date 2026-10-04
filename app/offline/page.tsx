export const metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-8 text-center">
      <div className="font-display text-5xl">📶</div>
      <h1 className="font-display mt-4 text-2xl font-extrabold tracking-tight">
        You&apos;re offline
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Standings and past results you&apos;ve already viewed still work. Making
        picks needs a connection, so nothing is lost — your card is exactly as
        you left it.
      </p>
    </main>
  );
}
