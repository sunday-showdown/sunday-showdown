'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SignOutButton() {
  const router = useRouter();

  const signOut = async () => {
    await createClient().auth.signOut();
    router.refresh();
    router.replace('/');
  };

  return (
    <button type="button" onClick={signOut} className="btn-ghost h-11 w-full text-sm text-loss">
      Sign out
    </button>
  );
}
