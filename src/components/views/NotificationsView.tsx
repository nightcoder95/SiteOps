import React from 'react';
import { ArrowLeft, Bell, Info } from 'lucide-react';
import { View } from '../../types';

interface NotificationsViewProps {
  navigate: (view: View) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({ navigate }) => (
  <div className="min-h-full bg-background flex flex-col">
    <header className="h-20 flex items-center px-8 bg-white sticky top-0 z-50 border-b border-outline-variant/30">
      <button onClick={() => navigate('HOME')} className="mr-6 p-2 bg-surface rounded-xl border border-outline-variant/30 active-press transition-all">
        <ArrowLeft className="w-6 h-6 text-primary" />
      </button>
      <h2 className="font-headline font-black uppercase text-sm tracking-widest text-on-surface">Broadcasts</h2>
    </header>
    <main className="p-8 space-y-4 max-w-[800px] mx-auto w-full">
      <button 
        onClick={() => alert("Redirecting to Safety Protocol Shift-Update Details...")}
        className="w-full text-left bg-primary/5 p-6 rounded-2xl border border-primary/20 flex gap-4 active-press group"
      >
         <Bell className="w-6 h-6 text-primary shrink-0 group-hover:scale-110 transition-transform" />
         <div>
            <p className="font-black text-xs uppercase tracking-tight group-hover:text-primary transition-colors">Project Node Update</p>
            <p className="text-xs font-medium text-on-surface-variant mt-1 leading-relaxed">New safety protocols added for High-Rise 402. Please review before next shift logs.</p>
            <p className="text-[8px] font-black text-primary uppercase mt-2 tracking-widest">Just Now</p>
         </div>
      </button>
      {[1, 2].map(i => (
        <button 
          key={i} 
          onClick={() => alert("Archive Notification: Weather Advisory Details unavailable in Demo Mode.")}
          className="w-full text-left bg-white p-6 rounded-2xl border border-outline-variant/30 flex gap-4 opacity-60 active-press hover:opacity-100 transition-all group"
        >
           <Bell className="w-6 h-6 text-on-surface-variant shrink-0 group-hover:text-primary transition-colors" />
           <div>
              <p className="font-black text-xs uppercase tracking-tight group-hover:text-primary transition-colors">Weather Alert</p>
              <p className="text-xs font-medium text-on-surface-variant mt-1 leading-relaxed">Heavy rains expected tomorrow. Waterproofing check required.</p>
              <p className="text-[8px] font-black text-on-surface-variant uppercase mt-2 tracking-widest">{i}d ago</p>
           </div>
        </button>
      ))}
    </main>
  </div>
);
