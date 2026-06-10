'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, Lock, LogIn, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { getSupabaseBrowserClient } from '@/lib/auth/browserClient';
import { toastSuccess } from '@/lib/ui/toast';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const supabase = getSupabaseBrowserClient();

  // Profiles are provisioned by admins (closed system) — no self-service
  // create-profile call on sign-in anymore.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        // Don't surface raw GoTrue text ("Invalid login credentials") — keep
        // copy controllable and non-enumerating.
        toast.error('Invalid email or password');
        return;
      }

      toastSuccess('Signed in');
      router.replace('/app/dashboard');
      router.refresh();
    } catch {
      toast.error('Sign-in failed');
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
            <LogIn className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface uppercase">SITEOPS</h1>
          <p className="mt-2 text-sm text-on-surface-variant font-medium">Command Access Portal</p>
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
              <label htmlFor="email" className="block text-xs font-extrabold uppercase tracking-widest text-on-surface-variant mb-2">
                EMAIL ADDRESS
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-standard pl-11"
                  placeholder="you@company.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-extrabold uppercase tracking-widest text-on-surface-variant mb-2">
                PASSWORD
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-standard pl-11"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="w-full btn-primary py-3.5 text-xs">
              {isLoading ? (
                <><Loader2 className="w-5 h-5 animate-spin" />Authenticating...</>
              ) : (
                <><LogIn className="w-5 h-5 mr-2" />Authorize Access</>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
