import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ChevronRight, LogOut as Logout, Radio, ShieldCheck, ClipboardList, PackagePlus } from 'lucide-react';
import { UserRole, View } from '@/lib/types/legacy';

interface SettingsViewProps {
  role: UserRole;
  onToggleRole: () => void;
  navigate: (view: View) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ 
  role, 
  onToggleRole, 
  navigate 
}) => (
  <div className="min-h-full bg-background flex flex-col">
     <header className="h-20 flex items-center px-8 bg-white sticky top-0 z-50 border-b border-outline-variant/30">
      <button onClick={() => navigate('HOME')} className="mr-6 p-2 bg-surface rounded-xl border border-outline-variant/30 active-press transition-all"><ArrowLeft className="w-6 h-6 text-primary" /></button>
      <h2 className="font-headline font-black uppercase text-sm tracking-widest text-on-surface">Control Center</h2>
    </header>
    <main className="p-8 space-y-8 max-w-[800px] mx-auto w-full pb-32">
      <div className="bg-white p-8 rounded-[24px] shadow-sm border border-outline-variant/30 space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-bold text-sm uppercase tracking-wider text-on-surface">Administrative Override</h3>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest opacity-60">Elevated privileges required</p>
          </div>
          <button 
            onClick={onToggleRole}
            className={`w-16 h-8 rounded-full p-1 transition-colors duration-300 ${role === 'admin' ? 'bg-primary' : 'bg-surface-container-highest'}`}
          >
            <motion.div 
              animate={{ x: role === 'admin' ? 32 : 0 }}
              className="w-6 h-6 bg-white rounded-full shadow-md"
            />
          </button>
        </div>
      </div>

      {role === 'admin' ? (
        <section className="space-y-4">
          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Manager Modules</label>
          <div className="grid grid-cols-1 gap-3">
             <button 
               onClick={() => navigate('ADMIN_LIVE_FEED')}
               className="w-full flex items-center justify-between p-6 bg-white rounded-2xl border border-outline-variant/30 active-press"
             >
                <div className="flex items-center gap-4">
                   <Radio className="w-5 h-5 text-primary animate-pulse" />
                   <div className="text-left">
                      <p className="text-xs font-black uppercase">Live Signal Feed</p>
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Real-time Supervisor Sync</p>
                   </div>
                </div>
                <ChevronRight className="w-5 h-5 opacity-30" />
             </button>
             <button 
               onClick={() => navigate('ADMIN_APPROVALS')}
               className="w-full flex items-center justify-between p-6 bg-white rounded-2xl border border-outline-variant/30 active-press"
             >
                <div className="flex items-center gap-4">
                   <ShieldCheck className="w-5 h-5 text-primary" />
                   <div className="text-left">
                      <p className="text-xs font-black uppercase">Approval Center</p>
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Manage Field & Resource Requests</p>
                   </div>
                </div>
                <ChevronRight className="w-5 h-5 opacity-30" />
             </button>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Field Operations</label>
          <div className="grid grid-cols-1 gap-3">
             <button 
               onClick={() => navigate('RESOURCE_REQUEST')}
               className="w-full flex items-center justify-between p-6 bg-white rounded-2xl border border-outline-variant/30 active-press"
             >
                <div className="flex items-center gap-4">
                   <PackagePlus className="w-5 h-5 text-primary" />
                   <div className="text-left">
                      <p className="text-xs font-black uppercase">Raise Logistics Signal</p>
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Request Labour, Materials or Funds</p>
                   </div>
                </div>
                <ChevronRight className="w-5 h-5 opacity-30" />
             </button>
             <button 
               onClick={() => alert("Current access level restricted. Please use the site logger for standard reporting.")}
               className="w-full flex items-center justify-between p-6 bg-white rounded-2xl border border-outline-variant/30 active-press opacity-50"
             >
                <div className="flex items-center gap-4">
                   <ClipboardList className="w-5 h-5 text-on-surface-variant" />
                   <div className="text-left">
                      <p className="text-xs font-black uppercase">Incident Reporting</p>
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Critical Site Disruption logs</p>
                   </div>
                </div>
                <ChevronRight className="w-5 h-5 opacity-30" />
             </button>
          </div>
        </section>
      )}

      <div className="bg-white p-8 rounded-[24px] shadow-sm border border-outline-variant/30 space-y-6">
         <h3 className="font-headline font-black text-[10px] uppercase text-on-surface-variant tracking-[0.2em] mb-4">Software Details</h3>
         <div className="space-y-4">
           <div className="flex justify-between text-[10px] font-bold tracking-widest uppercase">
              <span className="opacity-40">Version</span>
              <span className="text-on-surface">v2.4.0</span>
           </div>
           <div className="flex justify-between text-[10px] font-bold tracking-widest uppercase">
              <span className="opacity-40">Status</span>
              <span className="text-primary bg-primary/10 px-2 py-0.5 rounded">Stable Live</span>
           </div>
         </div>
      </div>

      <button 
        onClick={() => navigate('LOGIN')}
        className="w-full p-6 flex items-center justify-center gap-4 text-error font-headline font-black uppercase text-xs tracking-[0.2em] border-2 border-error/10 hover:bg-error/5 rounded-[24px] transition-all"
      >
        <Logout className="w-5 h-5" />
        Log Out
      </button>
    </main>
  </div>
);
