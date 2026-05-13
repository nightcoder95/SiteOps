'use client';

import type { ReactNode } from 'react';

import { AppFooterNav } from '@/components/app-shell/AppFooterNav';
import { AppHeader } from '@/components/app-shell/AppHeader';

export default function AppShell({
  children,
  role,
}: {
  children: ReactNode;
  role: 'Admin' | 'Supervisor';
}) {
  return (
    <div className="relative flex h-svh flex-col overflow-hidden bg-background pt-[var(--sat)] pl-[var(--sal)] pr-[var(--sar)]">
      <AppHeader role={role} />
      <main className="mobile-scroll-area blueprint-bg flex-1 px-6 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-6">
        {children}
      </main>
      <AppFooterNav role={role} />
    </div>
  );
}
