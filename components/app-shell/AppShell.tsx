'use client';

import type { ReactNode } from 'react';
import { AppFooterNav } from '@/components/app-shell/AppFooterNav';
import { AppHeader } from '@/components/app-shell/AppHeader';

export default function AppShell({
  children,
  role,
  initialUnread = 0,
}: {
  children: ReactNode;
  role: 'Admin' | 'Supervisor';
  initialUnread?: number;
}) {
  return (
    <div className="flex flex-col min-h-dvh bg-[#020617] pl-[var(--sal)] pr-[var(--sar)]">
      <AppHeader role={role} initialUnread={initialUnread} />
      <main className="flex-1 pb-24 pt-[calc(env(safe-area-inset-top)+5.25rem)] px-4 max-w-7xl mx-auto w-full">
        {children}
      </main>
      <AppFooterNav role={role} />
    </div>
  );
}
