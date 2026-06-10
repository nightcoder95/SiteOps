'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { CheckCircle, Users, Receipt, BarChart3, Radio } from 'lucide-react';

const tabs = [
  { label: 'Approvals', href: '/app/admin/approvals', icon: CheckCircle },
  { label: 'Users', href: '/app/admin/users', icon: Users },
  { label: 'Expenses', href: '/app/admin/expenses', icon: Receipt },
  { label: 'Analytics', href: '/app/admin/analytics', icon: BarChart3 },
  { label: 'Live Feed', href: '/app/admin/live-feed', icon: Radio },
];

export function AdminTabNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto scrollbar-none rounded-2xl bg-slate-950/40 backdrop-blur-xl border border-white/[0.06] p-1.5 shadow-2xl shadow-black/50">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              'relative flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-all duration-300 select-none cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-sky-500/50',
              active
                ? ''
                : 'hover:bg-white/[0.04] active:bg-white/[0.08]',
            ].join(' ')}
          >
            {active && (
              <motion.div
                layoutId="active-admin-tab"
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-sky-500/10 to-indigo-500/10 border border-sky-500/20 shadow-[0_0_12px_rgba(14,165,233,0.15)]"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span
              className={[
                'relative z-10 flex items-center gap-2 transition-colors duration-300',
                active ? 'text-sky-400 font-bold' : 'text-slate-400 hover:text-slate-200',
              ].join(' ')}
            >
              <tab.icon
                className={[
                  'h-4 w-4 transition-transform duration-300',
                  active ? 'scale-110 drop-shadow-[0_0_6px_rgba(56,189,248,0.6)]' : '',
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

