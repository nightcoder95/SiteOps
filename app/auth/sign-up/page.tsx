'use client';

import { motion } from 'motion/react';
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';

// SiteOps is closed / invite-only: self-signup is disabled. Admins provision
// every account; users only log in. This page is kept (not deleted) so signup
// can be re-enabled in future — the original form is preserved in the comment
// block below.
export default function SignUpPage() {
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
            <ShieldAlert className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-on-surface uppercase">Registration closed</h1>
          <p className="mt-2 text-sm text-on-surface-variant font-medium">
            SiteOps accounts are provisioned by an administrator. Contact your admin to get access.
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mt-8 sm:mx-auto sm:w-full sm:max-w-md"
      >
        <div className="card-standard py-8 px-6 sm:px-10 text-center">
          <Link
            href="/auth/sign-in"
            className="font-bold text-primary hover:text-primary/80 transition-colors uppercase tracking-widest text-xs"
          >
            Back to sign in
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

/* --- Original self-signup form (kept for future re-enable) ---
'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, Lock, User, UserPlus, Loader2, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { getSupabaseBrowserClient } from '@/lib/auth/browserClient';
import { toastSuccess } from '@/lib/ui/toast';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

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
      router.replace('/app/dashboard');
      router.refresh();
    } catch {
      toast.error('Sign-up failed');
    } finally {
      setIsLoading(false);
    }
  };

  // ...original form JSX omitted for brevity; see git history pre-RBAC...
}
*/
