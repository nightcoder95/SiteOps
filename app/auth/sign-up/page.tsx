'use client';

import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignUpPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '');
    const email = String(fd.get('email') ?? '');
    const password = String(fd.get('password') ?? '');

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      const profileResponse = await fetch('/api/auth/create-profile', { method: 'POST' });
      if (!profileResponse.ok) {
        setError('Account created, but profile setup failed. Please sign in and try again.');
        return;
      }
      router.replace('/app/dashboard');
    } catch {
      setError('Sign-up failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4">
      <p className="m-0 text-[11px] font-black uppercase tracking-[0.24em] text-on-surface-variant">SiteOps</p>
      <h1 className="m-0 text-3xl font-black tracking-tight text-on-surface">Sign up</h1>
      {error ? <p className="m-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{error}</p> : null}

      <form onSubmit={onSubmit} className="grid gap-3">
        <label className="grid gap-1.5 text-sm font-semibold text-on-surface">
          <span>Name</span>
          <input name="name" required className="w-full rounded-xl border border-outline-variant bg-surface px-3 py-2.5 text-sm text-on-surface" />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-on-surface">
          <span>Email</span>
          <input name="email" type="email" required className="w-full rounded-xl border border-outline-variant bg-surface px-3 py-2.5 text-sm text-on-surface" />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-on-surface">
          <span>Password</span>
          <input name="password" type="password" required className="w-full rounded-xl border border-outline-variant bg-surface px-3 py-2.5 text-sm text-on-surface" />
        </label>
        <button type="submit" disabled={loading} className="rounded-xl bg-machined-gradient px-4 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-60">
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="m-0 text-sm text-on-surface-variant">
        Already have an account? <Link href="/auth/sign-in" className="font-semibold text-primary">Sign in</Link>
      </p>
    </div>
  );
}
