import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  Users, 
  Wallet, 
  Info, 
  AlertCircle,
  X,
  Plus as Add,
  ArrowUpRight,
  ShieldCheck,
  Activity,
  ChevronRight,
  Clock,
  ArrowLeft
} from 'lucide-react';
import { UserRole, View, MOCK_SITES } from '../../types';

interface AdminAnalyticsViewProps {
  showInsiteHelp: boolean;
  setShowInsiteHelp: (show: boolean) => void;
  navigate: (view: View) => void;
}

export const AdminAnalyticsView: React.FC<AdminAnalyticsViewProps> = ({ 
  showInsiteHelp, 
  setShowInsiteHelp, 
  navigate 
}) => {
  const totalSpend = MOCK_SITES.reduce((acc, site) => acc + site.spend, 0);
  const totalForce = MOCK_SITES.reduce((acc, site) => acc + site.headcount, 0);

  const supervisors = [
    { name: 'David Miller', sector: 'Phase 2A', uptime: '98.4%', status: 'active' },
    { name: 'Sarah Chen', sector: 'Sector 4', uptime: '95.2%', status: 'active' },
    { name: 'Marcus Thorne', sector: 'Main Bridge', uptime: '82.1%', status: 'warning' },
  ];

  return (
    <div className="flex flex-col min-h-full bg-surface">
      <header className="sticky top-0 z-50 glass-header h-20 flex items-center justify-between px-8 border-b border-outline-variant/10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('HOME')} className="p-2 bg-surface rounded-xl border border-outline-variant/30 active-press">
            <ArrowLeft className="w-6 h-6 text-primary" />
          </button>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-1 leading-none">Management HQ</p>
            <h1 className="font-headline text-lg font-black uppercase tracking-tighter text-on-surface">Operations Pulse</h1>
          </div>
        </div>
        <button 
          onClick={() => setShowInsiteHelp(true)}
          className="p-2 text-primary active-press hover:bg-surface rounded-xl transition-colors"
        >
          <Info className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-grow p-8 space-y-8 overflow-y-auto no-scrollbar pb-32 max-w-[800px] mx-auto w-full">
        {/* Help Overlay */}
        <AnimatePresence>
          {showInsiteHelp && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-on-surface/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            >
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                className="bg-white w-full max-w-md rounded-[2.5rem] p-8 space-y-6 overflow-hidden relative"
              >
                <button 
                  onClick={() => setShowInsiteHelp(false)}
                  className="absolute top-6 right-6 p-2 bg-surface rounded-full active-press"
                >
                  <X className="w-5 h-5" />
                </button>
                
                <div className="space-y-2">
                  <h3 className="text-2xl font-black uppercase tracking-tighter">Global Oversight</h3>
                  <p className="text-sm text-on-surface-variant font-medium leading-relaxed">
                    This dashboard aggregates real-time data from all active worksites. Use this to monitor total burn rate and workforce distribution across the entire project footprint.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                      <TrendingUp className="text-primary w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-black uppercase text-xs mb-1">Total Burn</h4>
                      <p className="text-[10px] text-on-surface-variant font-bold leading-normal">
                        Cumulative expenditure verified by supervisor logs across all sectors.
                      </p>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => setShowInsiteHelp(false)}
                  className="w-full bg-primary text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs active-press"
                >
                  Acknowledge
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <section className="space-y-4">
          <div className="flex justify-between items-end px-2">
             <h3 className="font-headline text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Global Spend & Deployment</h3>
             <span className="text-[8px] font-bold text-success uppercase flex items-center gap-1">
                <Activity size={10} /> Live Aggregation
             </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => alert(`Total Capital Burn: ₹${(totalSpend / 100000).toFixed(2)}L from all registry logs.`)}
              className="bg-white rounded-[2rem] p-6 shadow-sm border border-outline-variant/10 text-left active-press group hover:border-primary transition-all"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-primary/10 rounded-xl text-primary"><Wallet size={20} /></div>
                <ArrowUpRight size={16} className="text-outline-variant group-hover:text-primary" />
              </div>
              <p className="text-[10px] font-bold uppercase text-on-surface-variant tracking-widest leading-none mb-1">Total Project Burn</p>
              <p className="text-2xl font-black text-on-surface tracking-tighter">₹{(totalSpend / 100000).toFixed(1)}L</p>
            </button>

            <button 
              onClick={() => alert(`Active Deployment: ${totalForce} personnel confirmed active across all sectors.`)}
              className="bg-white rounded-[2rem] p-6 shadow-sm border border-outline-variant/10 text-left active-press group hover:border-primary transition-all"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-primary/10 rounded-xl text-primary"><Users size={20} /></div>
                <ArrowUpRight size={16} className="text-outline-variant group-hover:text-primary" />
              </div>
              <p className="text-[10px] font-bold uppercase text-on-surface-variant tracking-widest leading-none mb-1">Global Workforce</p>
              <p className="text-2xl font-black text-on-surface tracking-tighter">{totalForce}</p>
            </button>
          </div>
        </section>

        <section className="bg-primary/5 rounded-[2.5rem] p-8 border border-primary/10 relative overflow-hidden active-press cursor-pointer" onClick={() => alert('Opening Detailed Allocation Analysis...')}>
           <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                 <ShieldCheck className="text-primary w-5 h-5" />
                 <h3 className="font-black uppercase text-xs tracking-widest">Global Allocation Mix</h3>
              </div>
              <div className="flex gap-1 h-3 rounded-full overflow-hidden mb-6 bg-surface">
                 <div className="bg-primary w-[45%]" />
                 <div className="bg-primary/60 w-[30%]" />
                 <div className="bg-primary/20 w-[25%]" />
              </div>
              <div className="space-y-4">
                 {[
                   { label: 'Infrastructure Materials', val: '45%', color: 'bg-primary' },
                   { label: 'Deployed Labour', val: '30%', color: 'bg-primary/60' },
                   { label: 'Machinery & Tools', val: '25%', color: 'bg-primary/20' }
                 ].map(item => (
                   <div key={item.label} className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                         <div className={`w-2 h-2 rounded-full ${item.color}`} />
                         <span className="text-[10px] uppercase font-bold text-on-surface-variant">{item.label}</span>
                      </div>
                      <span className="font-black text-xs">{item.val}</span>
                   </div>
                 ))}
              </div>
              <div className="mt-8 pt-8 border-t border-primary/10">
                 <p className="text-[9px] font-bold text-primary uppercase opacity-60 leading-relaxed italic">
                    HQ ALERT: Current Materials allocation is 5% above daily targets. Monitor Sector 4 for waste.
                 </p>
              </div>
           </div>
        </section>

        <section className="space-y-4">
           <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant px-2">Managed Sectors & Leadership</h3>
           <div className="space-y-3">
              {supervisors.map(sup => (
                <button 
                  key={sup.name}
                  onClick={() => alert(`Reviewing Supervisor: ${sup.name} | Sector: ${sup.sector}`)}
                  className="w-full bg-white p-5 rounded-3xl border border-outline-variant/10 shadow-sm flex items-center justify-between group active-press"
                >
                   <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${sup.status === 'active' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                         <Clock size={24} />
                      </div>
                      <div className="text-left">
                         <p className="text-[8px] font-bold uppercase text-on-surface-variant tracking-widest leading-none mb-1">{sup.sector}</p>
                         <h4 className="font-black uppercase text-sm">{sup.name}</h4>
                      </div>
                   </div>
                   <div className="text-right">
                      <p className="text-[10px] font-black text-primary">{sup.uptime}</p>
                      <p className="text-[8px] font-bold uppercase opacity-40">Sync Rate</p>
                   </div>
                </button>
              ))}
           </div>
        </section>

        <button 
          onClick={() => navigate('ADMIN_APPROVALS')}
          className="w-full bg-on-surface text-surface rounded-3xl p-6 flex items-center justify-between active-press shadow-xl shadow-on-surface/20"
        >
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-surface/10 rounded-2xl flex items-center justify-center">
                 <AlertCircle className="text-surface" size={24} />
              </div>
              <div className="text-left">
                 <h4 className="font-black uppercase text-sm leading-none">Resource Dispatch</h4>
                 <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mt-1">Pending Approval Checklist</p>
              </div>
           </div>
           <ChevronRight />
        </button>
      </main>
    </div>
  );
};
