'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { usePathname } from 'next/navigation';

import { AppFooterNav } from '@/components/app-shell/AppFooterNav';
import { AppHeader } from '@/components/app-shell/AppHeader';

export default function AppShell({
  children,
  role,
}: {
  children: ReactNode;
  role: 'Admin' | 'Supervisor';
}) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col min-h-screen bg-[#020617] pl-[var(--sal)] pr-[var(--sar)]">
      <AppHeader role={role} />
      <main className="flex-1 pb-24 pt-[calc(env(safe-area-inset-top)+3.5rem)] px-4 max-w-7xl mx-auto w-full">
        <AnimatePresence>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-full h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      <AppFooterNav role={role} />
    </div>
  );
}
