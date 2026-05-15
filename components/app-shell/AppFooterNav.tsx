'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Role = 'Admin' | 'Supervisor';

type NavItem = {
  href: string;
  label: string;
  icon: string;
  matches: RegExp;
};

const SUPERVISOR_ITEMS: NavItem[] = [
  { href: '/app/dashboard', label: 'Dashboard', icon: 'dashboard', matches: /^\/app\/dashboard$/ },
  { href: '/app/sites', label: 'Sites', icon: 'apartment', matches: /^\/app\/sites(\/|$)/ },
  { href: '/app/logs/new', label: 'Log', icon: 'edit_note', matches: /^\/app\/logs(\/|$)/ },
  { href: '/app/requests/resource', label: 'Requests', icon: 'assignment', matches: /^\/app\/requests(\/|$)/ },
  { href: '/app/profile', label: 'Profile', icon: 'account_circle', matches: /^\/app\/profile(\/|$)/ },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: '/app/dashboard', label: 'Dashboard', icon: 'dashboard', matches: /^\/app\/dashboard$/ },
  { href: '/app/admin/live-feed', label: 'Pulse', icon: 'pulse_alert', matches: /^\/app\/admin\/(live-feed|analytics)(\/|$)/ },
  { href: '/app/logs/new', label: 'Log', icon: 'edit_note', matches: /^\/app\/logs(\/|$)/ },
  { href: '/app/admin/expenses', label: 'Expenses', icon: 'account_balance_wallet', matches: /^\/app\/admin\/expenses(\/|$)/ },
  { href: '/app/profile', label: 'Profile', icon: 'account_circle', matches: /^\/app\/profile$/ },
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
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-outline-variant bg-surface-container-lowest pb-safe"
    >
      <div className="mx-auto grid w-full max-w-5xl grid-cols-5 items-end">
        {items.map((item) => {
          const active = item.matches.test(pathname);
          const isCenter = item.label === 'Log';

          if (isCenter) {
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
                className="active-press flex flex-col items-center justify-center py-2"
              >
                <span
                  className="flex h-14 w-14 -translate-y-3 items-center justify-center rounded-xl bg-primary text-on-primary shadow-lg shadow-primary/30"
                >
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {item.icon}
                  </span>
                </span>
                <span className="-mt-2 text-label-sm uppercase tracking-wider text-on-surface-variant">
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'active-press flex flex-col items-center gap-0.5 py-2',
                active ? 'text-primary' : 'text-on-surface-variant',
              ].join(' ')}
              title={item.label}
            >
              <span
                className="material-symbols-outlined text-[24px]"
                style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              <span className="text-label-sm uppercase tracking-wider">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
