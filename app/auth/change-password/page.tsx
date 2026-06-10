'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, KeyRound, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { getSupabaseBrowserClient } from '@/lib/auth/browserClient';
import { requestJson } from '@/lib/http/client';
import { toastSuccess } from '@/lib/ui/toast';

export default function ChangePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/auth/sign-in');
    router.refresh();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      const res = await requestJson<{ success: boolean }>('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newPassword: password }),
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }

      // CRITICAL: re-mint the token so the cleared must_change_password claim is
      // in effect before navigating — otherwise the stale claim bounces us back.
      await supabase.auth.refreshSession();

      toastSuccess('Password updated');
      router.replace('/app/dashboard');
      router.refresh();
    } catch {
      toast.error('Could not update password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="sm:mx-auto sm:w-full sm:max-w-md"
      >
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 mb-6">
            <KeyRound className="w-8 h-8 text-sky-400" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white uppercase">Set a new password</h1>
          <p className="mt-2 text-sm text-slate-500 font-medium">
            Your account was provisioned with a temporary password. Choose a new one to continue.
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mt-8 sm:mx-auto sm:w-full sm:max-w-md"
      >
        <div className="card-standard py-8 px-6 sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="password" className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-2">
                NEW PASSWORD
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-standard pl-11"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-2">
                CONFIRM PASSWORD
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-standard pl-11"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="w-full btn-primary py-3.5 text-xs">
              {isLoading ? (
                <><Loader2 className="w-5 h-5 animate-spin" />Updating...</>
              ) : (
                <><KeyRound className="w-5 h-5 mr-2" />Update Password</>
              )}
            </button>
          </form>

          <div className="mt-6">
            <p className="text-center text-xs text-slate-500">
              Not you?{' '}
              <button
                type="button"
                onClick={handleSignOut}
                className="font-bold text-sky-400 hover:text-sky-300 transition-colors uppercase tracking-widest"
              >
                Sign out
              </button>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
