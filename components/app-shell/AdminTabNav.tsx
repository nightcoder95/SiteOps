'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { CheckCircle, Users, Receipt, BarChart3, Radio, ListTree, Database } from 'lucide-react';

const tabs = [
  { label: 'Approvals', href: '/app/admin/approvals', icon: CheckCircle },
  { label: 'Users', href: '/app/admin/users', icon: Users },
  { label: 'Catalog', href: '/app/admin/catalog', icon: ListTree },
  { label: 'Expenses', href: '/app/admin/expenses', icon: Receipt },
  { label: 'Analytics', href: '/app/admin/analytics', icon: BarChart3 },
  { label: 'Live Feed', href: '/app/admin/live-feed', icon: Radio },
  { label: 'Data', href: '/app/admin/data', icon: Database },
];

export function AdminTabNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto scrollbar-none rounded-xl bg-slate-900/80 p-1 border border-white/10 shadow-xs">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              'relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-200 select-none cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-blue-500/50',
              active ? '' : 'hover:bg-white/5 active:bg-white/10',
            ].join(' ')}
          >
            {active && (
              <motion.div
                layoutId="active-admin-tab"
                className="absolute inset-0 rounded-lg bg-blue-600/20 border border-blue-500/40 shadow-xs"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span
              className={[
                'relative z-10 flex items-center gap-1.5 transition-colors duration-200',
                active ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200',
              ].join(' ')}
            >
              <tab.icon
                className={[
                  'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
                  active ? 'scale-105' : '',
                ].join(' ')}
              />
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
