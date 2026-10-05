export const metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-8 text-center">
      <div className="text-5xl">📶</div>
      <h1 className="display mt-4 text-[26px] leading-none">
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
