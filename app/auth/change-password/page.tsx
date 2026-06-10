'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, KeyRound, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { getSupabaseBrowserClient } from '@/lib/auth/browserClient';
import { requestJson } from '@/lib/http/client';
import { notifyError, toastSuccess } from '@/lib/ui/toast';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
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
    if (!currentPassword) {
      toast.error('Enter your current password');
      return;
    }
    if (password.length < 10) {
      toast.error('Password must be at least 10 characters');
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
        body: JSON.stringify({ currentPassword, newPassword: password }),
      });
      if (!res.ok) {
        notifyError(res);
        return;
      }

      // The server revoked every session (including this one) on success, so the
      // old token is dead. Sign out locally and re-authenticate with the new
      // password — this also mints a fresh claim with must_change_password=false.
      await supabase.auth.signOut();
      toastSuccess('Password updated — please sign in');
      router.replace('/auth/sign-in');
      router.refresh();
    } catch {
      toast.error('Could not update password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="sm:mx-auto sm:w-full sm:max-w-md"
      >
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-container border border-outline mb-6">
            <KeyRound className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface uppercase">Set a new password</h1>
          <p className="mt-2 text-sm text-on-surface-variant font-medium">
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
              <label htmlFor="currentPassword" className="block text-xs font-extrabold uppercase tracking-widest text-on-surface-variant mb-2">
                CURRENT / TEMPORARY PASSWORD
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="input-standard pl-11"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-extrabold uppercase tracking-widest text-on-surface-variant mb-2">
                NEW PASSWORD
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
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
              <label htmlFor="confirmPassword" className="block text-xs font-extrabold uppercase tracking-widest text-on-surface-variant mb-2">
                CONFIRM PASSWORD
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
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
            <p className="text-center text-xs text-on-surface-variant">
              Not you?{' '}
              <button
                type="button"
                onClick={handleSignOut}
                className="font-bold text-primary hover:text-primary/80 transition-colors uppercase tracking-widest"
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
