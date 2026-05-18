'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, Lock, User, UserPlus, Loader2, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'sonner';

import { toastSuccess } from '@/lib/ui/toast';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );

  async function ensureProfileExists() {
    try {
      await fetch('/api/auth/create-profile', { method: 'POST' });
    } catch {
      // non-blocking
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      setIsLoading(false);
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
      router.push('/app/dashboard');
      router.refresh();
    } catch {
      toast.error('Sign-up failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="sm:mx-auto sm:w-full sm:max-w-md"
      >
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 mb-6">
            <UserPlus className="w-8 h-8 text-sky-400" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white uppercase">Join SITEOPS</h1>
          <p className="mt-2 text-sm text-slate-500 font-medium">Register New Command Operator</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mt-8 sm:mx-auto sm:w-full sm:max-w-md"
      >
        <div className="card-standard py-8 px-6 sm:px-10">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="name" className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-2">
                FULL NAME
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input id="name" name="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className="input-standard pl-11" placeholder="John Doe" />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-2">
                EMAIL ADDRESS
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input id="email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input-standard pl-11" placeholder="you@company.com" />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-2">
                PASSWORD
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input id="password" name="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input-standard pl-11" placeholder="••••••••" />
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-2">
                CONFIRM PASSWORD
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input id="confirmPassword" name="confirmPassword" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input-standard pl-11" placeholder="••••••••" />
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="w-full btn-primary py-3.5 text-xs">
              {isLoading ? (
                <><Loader2 className="w-5 h-5 animate-spin" />Registering...</>
              ) : (
                <><UserPlus className="w-5 h-5 mr-2" />Create Operator Profile <ChevronRight className="w-4 h-4 ml-2" /></>
              )}
            </button>
          </form>

          <div className="mt-6">
            <p className="text-center text-xs text-slate-500">
              Already registered?{' '}
              <Link href="/auth/sign-in" className="font-bold text-sky-400 hover:text-sky-300 transition-colors uppercase tracking-widest">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
