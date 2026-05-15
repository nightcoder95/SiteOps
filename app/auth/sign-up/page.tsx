'use client';

import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { toastSuccess } from '@/lib/ui/toast';

export default function SignUpPage() {
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
      // Non-blocking
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get('name') ?? '');
    const email = String(fd.get('email') ?? '');
    const password = String(fd.get('password') ?? '');
    const confirm = String(fd.get('confirmPassword') ?? '');
    if (password !== confirm) {
      toast.error('Passwords do not match');
      setLoading(false);
      return;
    }
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (signUpError) {
        toast.error(signUpError.message);
        return;
      }
      await ensureProfileExists();
      toastSuccess('Account created');
      router.replace('/app/dashboard');
      router.refresh();
    } catch {
      toast.error('Sign-up failed');
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'h-11 w-full rounded border border-outline bg-surface-container-lowest pl-10 pr-4 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <>
      <div className="flex flex-col items-center border-b border-outline-variant bg-surface-container-lowest px-8 pt-8 pb-4">
        <div className="mb-4 rounded-full bg-primary-container p-3 text-on-primary-container">
          <span
            className="material-symbols-outlined"
            style={{ fontVariationSettings: "'FILL' 1", fontSize: '32px' }}
          >
            engineering
          </span>
        </div>
        <h1 className="font-display-lg text-display-lg text-primary mb-1">Join SiteOps</h1>
        <p className="font-body-md text-body-md text-center text-on-surface-variant">
          Create your field operations account
        </p>
      </div>

      <div className="px-8 pt-6 pb-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="font-label-md text-label-md uppercase text-on-surface">
              Full Name
            </label>
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-on-surface-variant">
                person
              </span>
              <input id="name" name="name" required className={inputClass} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="font-label-md text-label-md uppercase text-on-surface">
              Email Address
            </label>
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-on-surface-variant">
                mail
              </span>
              <input id="email" name="email" type="email" required className={inputClass} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="font-label-md text-label-md uppercase text-on-surface">
              Password
            </label>
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-on-surface-variant">
                lock
              </span>
              <input id="password" name="password" type="password" required className={inputClass} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="confirmPassword" className="font-label-md text-label-md uppercase text-on-surface">
              Confirm Password
            </label>
            <div className="relative">
              <span className="material-symbols-outlined pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-on-surface-variant">
                lock_reset
              </span>
              <input id="confirmPassword" name="confirmPassword" type="password" required className={inputClass} />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded bg-primary font-label-md text-label-md uppercase text-on-primary transition-colors hover:bg-surface-tint disabled:opacity-60"
          >
            <span>{loading ? 'Creating…' : 'Create Account'}</span>
            <span className="material-symbols-outlined">person_add</span>
          </button>
        </form>

        <p className="font-body-md text-body-md mt-6 text-center text-on-surface-variant">
          Already have an account?{' '}
          <Link href="/auth/sign-in" className="font-label-md text-label-md uppercase text-primary">
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}
