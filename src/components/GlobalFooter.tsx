import React from 'react';
import { Home, History, Plus as Add, BarChart4 as Analytics, Settings, Wallet } from 'lucide-react';
import { View, UserRole } from '../types';

interface GlobalFooterProps {
  currentView: View;
  role: UserRole;
  navigate: (view: View) => void;
}

export function GlobalFooter({ currentView, role, navigate }: GlobalFooterProps) {
  const hideFooter = ['LOGIN', 'SITE_SELECTION', 'ENTRY_CATEGORIES', 'ENTRY_SUBCATEGORIES', 'ENTRY_FORM', 'ENTRY_EDIT'].includes(currentView);
  if (hideFooter) return null;

  const active = (views: View[]) => views.includes(currentView) ? 'text-primary' : 'text-on-surface-variant/40';

  return (
    <nav className="fixed bottom-0 w-full z-50 glass-header border-t border-outline-variant/30 pb-[var(--sab)] flex justify-around items-center px-4 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] h-20">
      <button onClick={() => navigate('HOME')} className={`flex flex-col items-center gap-1.5 py-4 active-press ${active(['HOME'])}`}>
        <Home className="w-6 h-6" />
        <span className="text-[9px] font-black uppercase tracking-widest leading-none">Home</span>
      </button>

      {role === 'admin' ? (
        <button onClick={() => navigate('ADMIN_ANALYTICS')} className={`flex flex-col items-center gap-1.5 py-4 active-press ${active(['ADMIN_ANALYTICS'])}`}>
          <Analytics className="w-6 h-6" />
          <span className="text-[9px] font-black uppercase tracking-widest leading-none">Pulse</span>
        </button>
      ) : (
        <button onClick={() => navigate('HISTORY')} className={`flex flex-col items-center gap-1.5 py-4 active-press ${active(['HISTORY'])}`}>
          <History className="w-6 h-6" />
          <span className="text-[9px] font-black uppercase tracking-widest leading-none">History</span>
        </button>
      )}

      <button
        onClick={() => navigate('HOME')}
        className="w-16 h-16 -mt-16 rounded-3xl machined-gradient text-white flex items-center justify-center shadow-xl shadow-primary/30 border-4 border-white active-press"
        title="Home"
      >
        <Add className="w-9 h-9" />
      </button>

      {role === 'admin' ? (
        <button onClick={() => navigate('EXPENSE_MANAGER')} className={`flex flex-col items-center gap-1.5 py-4 active-press ${active(['EXPENSE_MANAGER'])}`}>
          <Wallet className="w-6 h-6" />
          <span className="text-[9px] font-black uppercase tracking-widest leading-none">Expenses</span>
        </button>
      ) : (
        <button onClick={() => navigate('RESOURCE_REQUEST')} className={`flex flex-col items-center gap-1.5 py-4 active-press ${active(['RESOURCE_REQUEST'])}`}>
          <Analytics className="w-6 h-6" />
          <span className="text-[9px] font-black uppercase tracking-widest leading-none">Requests</span>
        </button>
      )}

      <button onClick={() => navigate('SETTINGS')} className={`flex flex-col items-center gap-1.5 py-4 active-press ${active(['SETTINGS'])}`}>
        <Settings className="w-6 h-6" />
        <span className="text-[9px] font-black uppercase tracking-widest leading-none">Settings</span>
      </button>
    </nav>
  );
}
