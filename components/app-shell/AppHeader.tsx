'use client';

import { Bell, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

export function AppHeader({ role }: { role: 'Admin' | 'Supervisor' }) {
  const pathname = usePathname();
  const router = useRouter();
  const isDashboard = pathname === '/app/dashboard';

  return (
    <header className="sticky top-0 z-30 h-20 border-b border-outline-variant/40 bg-surface px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          {isDashboard ? (
            <button
              type="button"
              onClick={() => router.push('/app/sites')}
              className="active-press p-1 text-on-surface-variant"
              aria-label="Open sites"
            >
              <Menu className="h-6 w-6" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.back()}
              className="active-press rounded-2xl border border-outline-variant/60 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-on-surface"
              aria-label="Go back"
            >
              Back
            </button>
          )}

          <h1 className="font-headline text-[1.05rem] font-black uppercase leading-none tracking-tight text-on-surface">
            SITE
            <br />
            <span className="text-[10px] font-bold tracking-[0.28em] text-primary opacity-90">CORE</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/app/notifications" className="relative active-press p-1 text-on-surface-variant" aria-label="Notifications">
            <Bell className="h-6 w-6" />
            <span className="absolute right-0 top-0 h-2 w-2 rounded-full border border-surface bg-primary" />
          </Link>
          <Link href="/app/profile" className="h-8 w-8 overflow-hidden rounded-full border border-outline-variant/30 active-press" aria-label={`${role} profile`}>
            <img src="https://picsum.photos/seed/headshot/200/200" alt={`${role} profile`} className="h-full w-full object-cover" />
          </Link>
        </div>
      </div>
    </header>
  );
}
