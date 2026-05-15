'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

type Props = {
  role: 'Admin' | 'Supervisor';
  title?: string;
  showBack?: boolean;
  action?: 'search' | 'notifications' | 'none';
};

const ROUTE_TITLES: Record<string, string> = {
  '/app/dashboard': 'SiteOps',
  '/app/sites': 'Active Sites',
  '/app/sites/new': 'Create Site',
  '/app/profile': 'Profile',
  '/app/notifications': 'Notifications',
  '/app/admin/live-feed': 'Live Feed',
  '/app/admin/approvals': 'Approvals',
  '/app/admin/expenses': 'Expenses',
  '/app/admin/analytics': 'Analytics',
  '/app/requests/field': 'Field Requests',
  '/app/requests/resource': 'Resource Requests',
  '/app/transfers/new': 'Transfer Resources',
  '/app/logs/new': 'Log Entry',
};

function resolveTitle(pathname: string): string {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  if (pathname.startsWith('/app/sites/')) return 'Site Detail';
  if (pathname.startsWith('/app/logs/new/')) return 'Log Entry';
  if (pathname.startsWith('/app/logs/')) return 'Edit Entry';
  return 'SiteOps';
}

export function AppHeader({ role: _role, title, showBack, action }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const isDashboard = pathname === '/app/dashboard';
  const resolvedTitle = title ?? resolveTitle(pathname);
  const resolvedShowBack = showBack ?? !isDashboard;
  const resolvedAction = action ?? (isDashboard ? 'notifications' : 'none');

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-margin-mobile pt-[var(--sat)]">
      {resolvedShowBack ? (
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="active-press p-2 -ml-2 rounded-full text-on-surface-variant hover:bg-surface-variant flex items-center justify-center"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => router.push('/app/sites')}
          aria-label="Open sites"
          className="active-press p-2 -ml-2 rounded-full text-on-surface-variant hover:bg-surface-variant flex items-center justify-center"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
      )}

      <h1 className="font-headline-md-mobile text-headline-md-mobile font-bold tracking-tight text-primary truncate">
        {resolvedTitle}
      </h1>

      {resolvedAction === 'notifications' ? (
        <Link
          href="/app/notifications"
          aria-label="Notifications"
          className="active-press p-2 -mr-2 rounded-full text-on-surface-variant hover:bg-surface-variant flex items-center justify-center relative"
        >
          <span className="material-symbols-outlined">notifications</span>
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full border border-surface-container-lowest bg-error" />
        </Link>
      ) : resolvedAction === 'search' ? (
        <button
          type="button"
          aria-label="Search"
          className="active-press p-2 -mr-2 rounded-full text-on-surface-variant hover:bg-surface-variant flex items-center justify-center"
        >
          <span className="material-symbols-outlined">search</span>
        </button>
      ) : (
        <span className="w-10" aria-hidden />
      )}
    </header>
  );
}
