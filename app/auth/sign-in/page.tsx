'use client';

import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { toastSuccess } from '@/lib/ui/toast';

export default function SignInPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  const [loading, setLoading] = useState(false);

  async function ensureProfileExists() {
    try {
      await fetch('/api/auth/create-profile', { method: 'POST' });
    } catch {
      // Non-blocking: profile endpoint can race immediately after auth cookie updates.
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') ?? '');
    const password = String(fd.get('password') ?? '');

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        toast.error(signInError.message);
        return;
      }
      await ensureProfileExists();
      toastSuccess('Signed in');
      router.replace('/app/dashboard');
      router.refresh();
    } catch {
      toast.error('Sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4">
      <p className="m-0 text-[11px] font-black uppercase tracking-[0.24em] text-on-surface-variant">SiteOps</p>
      <h1 className="m-0 text-3xl font-black tracking-tight text-on-surface">Sign in</h1>
      <form onSubmit={onSubmit} className="grid gap-3">
        <label className="grid gap-1.5 text-sm font-semibold text-on-surface">
          <span>Email</span>
          <input name="email" type="email" required className="w-full rounded-xl border border-outline-variant bg-surface px-3 py-2.5 text-sm text-on-surface" />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-on-surface">
          <span>Password</span>
          <input name="password" type="password" required className="w-full rounded-xl border border-outline-variant bg-surface px-3 py-2.5 text-sm text-on-surface" />
        </label>
        <button type="submit" disabled={loading} className="rounded-xl bg-machined-gradient px-4 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-60">
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="m-0 text-sm text-on-surface-variant">
        <Link href="/auth/sign-up" className="font-semibold text-primary">Create an account</Link>
      </p>
    </div>
  );
}
