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
    <div className="relative flex h-svh flex-col overflow-hidden bg-background pl-[var(--sal)] pr-[var(--sar)]">
      <AppHeader role={role} />
      <main className="mobile-scroll-area flex-1 pt-[calc(env(safe-area-inset-top)+3.5rem)] pb-[calc(env(safe-area-inset-bottom)+5rem)] px-margin-mobile">
        <div className="mx-auto w-full max-w-md md:max-w-3xl py-density-medium">{children}</div>
      </main>
      <AppFooterNav role={role} />
    </div>
  );
}
