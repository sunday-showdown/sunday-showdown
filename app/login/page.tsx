import { Suspense } from 'react';
import Link from 'next/link';
import Wordmark from '@/components/Wordmark';
import LoginForm from '@/components/LoginForm';
import { enabledProviders } from '@/lib/auth-providers';

export const metadata = { title: 'Sign in' };

// The form reads `?next=` with useSearchParams, which cannot be prerendered
// without a Suspense boundary. The page shell stays static and only the form
// waits for the client.
export default async function LoginPage() {
  const providers = await enabledProviders();

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 safe-top">
      <header className="py-3">
        <Link href="/" className="display text-[19px] leading-none">
          <Wordmark />
        </Link>
      </header>

      <Suspense fallback={<LoginSkeleton />}>
        <LoginForm providers={providers} />
      </Suspense>
    </main>
  );
}

function LoginSkeleton() {
  return (
    <div className="pt-10" aria-hidden="true">
      <div className="h-9 w-48 rounded-lg bg-raised" />
      <div className="mt-3 h-4 w-60 rounded bg-raised/60" />
      <div className="mt-8 space-y-4">
        <div className="h-12 rounded-xl bg-raised" />
        <div className="h-12 rounded-xl bg-raised" />
        <div className="h-12 rounded-xl bg-raised/60" />
      </div>
    </div>
  );
}
