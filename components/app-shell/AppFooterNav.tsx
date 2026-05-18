'use client';

import { LayoutDashboard, ClipboardList, Repeat, Activity, BarChart3, PlusCircle } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'motion/react';

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

type Role = 'Admin' | 'Supervisor';

export function AppFooterNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { label: 'Home', icon: LayoutDashboard, href: '/app/dashboard', active: pathname === '/app/dashboard' },
    { label: 'Requests', icon: Activity, href: '/app/requests/resource', active: pathname.startsWith('/app/requests') },
    { label: 'New Log', icon: PlusCircle, href: '/app/logs/new', active: pathname.startsWith('/app/logs'), primary: true },
    { label: 'Transfers', icon: Repeat, href: '/app/transfers/new', active: pathname.startsWith('/app/transfers') },
    ...(role === 'Admin'
      ? [{ label: 'Admin', icon: BarChart3, href: '/app/admin/approvals', active: pathname.startsWith('/app/admin') }]
      : [{ label: 'Profile', icon: ClipboardList, href: '/app/profile', active: pathname === '/app/profile' }]),
  ];

  return (
    <nav className="nav-blur fixed bottom-0 left-0 right-0 z-50 border-t border-white/5">
      <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
        {navItems.map((item) => (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            className={cn(
              'relative flex flex-col items-center justify-center transition-all duration-300 gap-1',
              item.primary
                ? '-mt-8 mb-4 p-3 bg-sky-500 rounded-full shadow-lg shadow-sky-500/20 ring-8 ring-slate-950'
                : 'px-3',
              item.active ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300',
            )}
            aria-label={item.label}
          >
            {item.active && !item.primary && (
              <motion.div
                layoutId="nav-dot"
                className="w-1.5 h-1.5 bg-sky-400 rounded-full mb-0.5"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            )}
            {!item.active && !item.primary && (
              <div className="w-1.5 h-1.5 bg-white rounded-full mb-0.5 opacity-10" />
            )}

            {item.primary ? (
              <item.icon className="w-8 h-8 text-slate-950" />
            ) : (
              <>
                <item.icon className="w-5 h-5" />
                <span
                  className={cn(
                    'text-[9px] font-bold uppercase tracking-widest leading-none',
                    item.active ? 'text-sky-400' : 'text-slate-500',
                  )}
                >
                  {item.label}
                </span>
              </>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
