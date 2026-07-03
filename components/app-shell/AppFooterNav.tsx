'use client';

import { ArrowRightLeft, BarChart3, FileText, Home, Plus, User } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

import { can } from '@/lib/auth/capabilities';
import type { Role } from '@/lib/auth/roles';

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

export function AppFooterNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { label: 'Home', icon: Home, href: '/app/dashboard', active: pathname === '/app/dashboard' || pathname.startsWith('/app/tools') },
    { label: 'Requests', icon: FileText, href: '/app/requests/resource', active: pathname.startsWith('/app/requests') },
    { label: 'New Log', icon: Plus, href: '/app/logs/new', active: pathname.startsWith('/app/logs'), primary: true },
    { label: 'Transfers', icon: ArrowRightLeft, href: '/app/transfers/new', active: pathname.startsWith('/app/transfers') },
    ...(can(role, 'resource:manage_all')
      ? [{ label: 'Admin', icon: BarChart3, href: '/app/admin/approvals', active: pathname.startsWith('/app/admin') }]
      : [{ label: 'Profile', icon: User, href: '/app/profile', active: pathname === '/app/profile' }]),
  ];

  return (
    <nav className="nav-blur fixed bottom-0 left-0 right-0 z-50 border-t border-white/5">
      <div className="mx-auto flex h-20 max-w-2xl items-center justify-around px-6">
        {navItems.map((item) =>
          item.primary ? (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              aria-label={item.label}
              className="-mt-8 grid h-16 w-16 shrink-0 place-items-center rounded-full bg-blue-600 text-white shadow-[0_0_24px] shadow-blue-600/50 ring-8 ring-[#020617] transition-all duration-200 hover:bg-blue-500 active:scale-95"
            >
              <item.icon className="h-7 w-7" strokeWidth={2.5} />
            </button>
          ) : (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              aria-label={item.label}
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1.5 transition-colors duration-200',
                item.active ? 'text-blue-500' : 'text-slate-500 hover:text-slate-300',
              )}
            >
              <item.icon className="h-6 w-6" strokeWidth={item.active ? 2.5 : 2} />
              <span className="text-[10px] font-bold uppercase tracking-widest leading-none">{item.label}</span>
            </button>
          ),
        )}
      </div>
    </nav>
  );
}
