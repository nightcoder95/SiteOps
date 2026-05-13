'use client';

import { BarChart3, History, Home, Plus, Settings, Wallet } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Role = 'Admin' | 'Supervisor';

type NavItem = {
  href: string;
  label: string;
  icon: typeof Home;
  matches: RegExp;
};

const SUPERVISOR_ITEMS: NavItem[] = [
  { href: '/app/dashboard', label: 'Home', icon: Home, matches: /^\/app\/dashboard$/ },
  { href: '/app/sites', label: 'History', icon: History, matches: /^\/app\/sites(\/|$)/ },
  { href: '/app/forms', label: 'Quick Log', icon: Plus, matches: /^\/app\/forms(\/|$)/ },
  { href: '/app/requests/resource', label: 'Requests', icon: Wallet, matches: /^\/app\/requests(\/|$)/ },
  { href: '/app/profile', label: 'Settings', icon: Settings, matches: /^\/app\/profile(\/|$)/ },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: '/app/dashboard', label: 'Home', icon: Home, matches: /^\/app\/dashboard$/ },
  { href: '/app/admin/live-feed', label: 'Pulse', icon: BarChart3, matches: /^\/app\/admin\/(live-feed|analytics)(\/|$)/ },
  { href: '/app/forms', label: 'Quick Log', icon: Plus, matches: /^\/app\/forms(\/|$)/ },
  { href: '/app/admin/expenses', label: 'Expenses', icon: Wallet, matches: /^\/app\/admin\/expenses(\/|$)/ },
  { href: '/app/profile', label: 'Settings', icon: Settings, matches: /^\/app\/profile$/ },
];

export function AppFooterNav({
  role,
  ariaLabel = 'Primary App Nav',
}: {
  role: Role;
  ariaLabel?: string;
}) {
  const pathname = usePathname();
  const items = role === 'Admin' ? ADMIN_ITEMS : SUPERVISOR_ITEMS;

  return (
    <nav
      aria-label={ariaLabel}
      className="fixed bottom-0 left-0 right-0 z-40 flex h-24 items-center justify-around border-t border-outline-variant/50 bg-surface px-4 pb-[var(--sab)] shadow-[0_-10px_40px_rgba(0,0,0,0.04)]"
    >
      <div className="mx-auto grid w-full max-w-5xl grid-cols-5 items-end">
        {items.map((item) => {
          const active = item.matches.test(pathname);
          const Icon = item.icon;
          const isCenter = item.label === 'Quick Log';

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'active-press flex flex-col items-center gap-1.5 py-4',
                active ? 'text-primary' : 'text-on-surface-variant/40',
              ].join(' ')}
              aria-current={active ? 'page' : undefined}
              title={item.label}
            >
              {isCenter ? (
                <span className="flex h-16 w-16 -translate-y-5 items-center justify-center rounded-3xl border-4 border-white bg-[linear-gradient(135deg,#F97316_0%,#EA580C_100%)] text-white shadow-xl shadow-primary/30">
                  <Icon className="h-8 w-8" />
                </span>
              ) : (
                <Icon className="h-6 w-6" />
              )}
              <span className="text-[9px] font-black uppercase leading-none tracking-widest">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
