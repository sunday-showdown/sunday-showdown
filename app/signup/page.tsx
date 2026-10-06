import Link from 'next/link';
import Wordmark from '@/components/Wordmark';
import SignupForm from '@/components/SignupForm';
import { enabledProviders } from '@/lib/auth-providers';

export const metadata = { title: 'Create account' };

// A server component so it can ask Supabase which social sign-ins are enabled
// before rendering; the form itself stays on the client.
export default async function SignupPage() {
  const providers = await enabledProviders();

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 safe-top">
      <header className="py-3">
        <Link href="/" className="display text-[19px] leading-none">
          <Wordmark />
        </Link>
      </header>

      <SignupForm providers={providers} />
    </main>
  );
}
