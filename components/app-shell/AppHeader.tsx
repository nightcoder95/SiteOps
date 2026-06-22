'use client';

import { Bell, ChevronLeft, User } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

import type { Role } from '@/lib/auth/roles';
import { useApiQuery } from '@/lib/http/useApiQuery';
import { UNREAD_BADGE_KEY } from '@/lib/http/notificationsKeys';

type Props = {
  // Use the canonical Role type rather than a duplicated literal union. The
  // branches below are label-only (display copy), not access gates — anything
  // access-relevant must go through can() (lib/auth/capabilities).
  role: Role;
  // Server-seeded unread count so the badge renders instantly on first paint
  // (no cold client fetch); SWR revalidates in the background.
  initialUnread?: number;
};

type UnreadResponse = { total: number };

export function AppHeader({ role, initialUnread = 0 }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const isDashboard = pathname === '/app/dashboard';

  // Unread badge via the shared SWR cache. `fallbackData` renders the
  // server-seeded count immediately; SWR revalidates on mount/focus and after a
  // mark-as-read (the notifications page mutates UNREAD_BADGE_KEY directly), so
  // no per-navigation forced revalidation is needed.
  const { data } = useApiQuery<UnreadResponse>(UNREAD_BADGE_KEY, {
    fallbackData: { total: initialUnread },
  });
  const unread = data ? Number(data.total ?? 0) : 0;

  return (
    <header className="glass-header safe-area-top fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-background/80">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {!isDashboard ? (
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 rounded-xl hover:bg-white/5 transition-colors"
              aria-label="Go back"
            >
              <ChevronLeft className="w-5 h-5 text-slate-400" />
            </button>
          ) : (
            <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center text-slate-950 font-bold shrink-0">
              S
            </div>
          )}
          <div className="flex flex-col">
            <span className="text-lg font-extrabold tracking-tight text-white uppercase leading-none">
              SiteOps
            </span>
            <span className="text-[9px] text-sky-500 font-bold uppercase tracking-widest leading-none mt-1">
              {role === 'Admin' ? 'Admin Command Interface' : 'Supervisor Command Interface'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/app/notifications')}
            className="p-2 text-slate-500 hover:text-sky-400 transition-colors relative"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unread > 0 ? (
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-slate-950"
                aria-label={`${unread} unread notification${unread === 1 ? '' : 's'}`}
              />
            ) : null}
          </button>

          <div className="h-8 w-px bg-white/5 mx-2 hidden sm:block"></div>

          <button
            onClick={() => router.push('/app/profile')}
            className="flex items-center gap-3 pl-2 group"
            aria-label="Profile"
          >
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-white leading-none">Operator</p>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-1">{role}</p>
            </div>
            <div className="w-9 h-9 bg-white/5 rounded-full border border-white/5 flex items-center justify-center group-hover:border-sky-500 transition-all overflow-hidden shadow-lg">
              <User className="w-5 h-5 text-slate-500" />
            </div>
          </button>
        </div>
      </div>
    </header>
  );
}
