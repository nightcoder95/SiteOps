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
  const [showPassword, setShowPassword] = useState(false);

  async function ensureProfileExists() {
    try {
      await fetch('/api/auth/create-profile', { method: 'POST' });
    } catch {
      // Non-blocking
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') ?? '');
    const password = String(fd.get('password') ?? '');
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
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
    <>
      <div className="flex flex-col items-center border-b border-outline-variant bg-surface-container-lowest px-8 pt-8 pb-4">
        <div className="mb-4 rounded-full bg-primary-container p-3 text-on-primary-container">
          <span
            className="material-symbols-outlined"
            style={{ fontVariationSettings: "'FILL' 1", fontSize: '32px' }}
          >
            construction
          </span>
        </div>
        <h1 className="font-display-lg text-display-lg text-primary mb-1">SiteOps</h1>
        <p className="font-body-md text-body-md text-center text-on-surface-variant">
          Secure authentication for field personnel
        </p>
      </div>

      <div className="px-8 pt-6 pb-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="font-label-md text-label-md uppercase text-on-surface">
              Email Address
            </label>
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-on-surface-variant">
                mail
              </span>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="personnel@siteops.com"
                className="h-11 w-full rounded border border-outline bg-surface-container-lowest pl-10 pr-4 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="font-label-md text-label-md uppercase text-on-surface">
                Password
              </label>
              <Link href="#" className="font-label-md text-label-md uppercase text-primary">
                Forgot?
              </Link>
            </div>
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-on-surface-variant">
                lock
              </span>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                className="h-11 w-full rounded border border-outline bg-surface-container-lowest pl-10 pr-10 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-on-surface-variant"
              >
                <span className="material-symbols-outlined">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded bg-primary font-label-md text-label-md uppercase text-on-primary transition-colors hover:bg-surface-tint disabled:opacity-60"
          >
            <span>{loading ? 'Signing in…' : 'Sign In'}</span>
            <span className="material-symbols-outlined">login</span>
          </button>
        </form>

        <p className="font-body-md text-body-md mt-6 text-center text-on-surface-variant">
          Don&apos;t have an account?{' '}
          <Link href="/auth/sign-up" className="font-label-md text-label-md uppercase text-primary">
            Sign up
          </Link>
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 border-t border-outline-variant bg-surface-container-low p-4 font-label-sm text-label-sm text-on-surface-variant">
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
          verified_user
        </span>
        <span>SiteOps Industrial Platform</span>
      </div>
    </>
  );
}
