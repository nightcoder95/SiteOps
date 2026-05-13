import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, X as Close, Package, Users, Wallet, Drill, ChevronRight } from 'lucide-react';

interface ApprovalCenterViewProps {
  navigate: (view: any) => void;
}

export const ApprovalCenterView: React.FC<ApprovalCenterViewProps> = ({ navigate }) => {
  const [mergingField, setMergingField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'Dictionary' | 'Logistics'>('Logistics');

  const resourceRequests = [
    { id: 'SIGNAL-402', type: 'Labour', siteId: 'Oak Tower', details: '10 Skilled Mason required for Level 4 slab.', reason: 'Urgent deadline for structural phase.', requestedBy: 'Supervisor Alpha' },
    { id: 'SIGNAL-409', type: 'Materials', siteId: 'Bridge Project', details: '50 MT Reinforcement Steel (Fe 500)', reason: 'Low inventory, next shipment delayed.', requestedBy: 'Supervisor Beta' },
  ];

  return (
    <div className="min-h-full bg-surface flex flex-col relative">
      <header className="h-20 flex items-center px-8 bg-white sticky top-0 z-50 border-b border-outline-variant/10">
        <button onClick={() => navigate('ADMIN_ANALYTICS')} className="mr-6 p-2 bg-surface rounded-xl border border-outline-variant/30 active-press transition-all">
          <ArrowLeft className="w-6 h-6 text-primary" />
        </button>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-1 leading-none">Management Center</p>
          <h2 className="font-headline font-black uppercase text-lg tracking-tighter text-on-surface">Dispatch Hub</h2>
        </div>
      </header>

      <div className="flex bg-white px-8 border-b border-outline-variant/10 sticky top-20 z-40">
        <button 
          onClick={() => setActiveTab('Dictionary')}
          className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'Dictionary' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant'}`}
        >
          Schemas
        </button>
        <button 
          onClick={() => setActiveTab('Logistics')}
          className={`flex-1 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${activeTab === 'Logistics' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant'}`}
        >
          Logistics
        </button>
      </div>

      <main className="p-8 space-y-8 max-w-[800px] mx-auto w-full pb-32">
        {activeTab === 'Dictionary' ? (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-6 bg-primary rounded-full" />
              <h3 className="font-headline font-black text-sm uppercase tracking-widest text-on-surface">Proposed Dictionary Extensions</h3>
            </div>
            
            <div className="bg-white p-6 rounded-3xl border border-outline-variant/30 shadow-sm space-y-6">
              <div className="flex justify-between items-start">
                 <div>
                    <h4 className="font-black text-sm uppercase tracking-tight text-on-surface">Heavy Load Tiller</h4>
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase mt-1 tracking-widest">Target: Machinery {'>'} Groundwork</p>
                 </div>
                 <span className="text-[8px] font-black uppercase bg-warning/10 text-warning px-2 py-1 rounded-full">New Node</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button 
                   onClick={() => alert("Dictionary protocol updated. Node 'Heavy Load Tiller' integrated into Master Registry.")}
                   className="py-3 bg-primary text-on-primary rounded-xl font-black text-[9px] uppercase tracking-widest active-press shadow-md shadow-primary/10"
                >
                   Verify Node
                </button>
                <button 
                  onClick={() => setMergingField('Heavy Load Tiller')}
                  className="py-3 bg-white border border-error/30 text-error rounded-xl font-black text-[9px] uppercase tracking-widest active-press"
                >
                  Discard Signal
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-6 bg-primary rounded-full" />
              <h3 className="font-headline font-black text-sm uppercase tracking-widest text-on-surface">Logistics Acquisition Signals</h3>
            </div>

            {resourceRequests.map((req) => (
              <div key={req.id} className="bg-white p-6 rounded-3xl border border-outline-variant/30 shadow-sm space-y-6">
                <div className="flex justify-between items-start">
                  <div className="flex gap-4">
                     <div className="w-10 h-10 rounded-xl bg-surface flex items-center justify-center text-primary border border-outline-variant/10">
                        {req.type === 'Labour' && <Users className="w-5 h-5" />}
                        {req.type === 'Materials' && <Package className="w-5 h-5" />}
                        {req.type === 'Money' && <Wallet className="w-5 h-5" />}
                        {req.type === 'Machinery' && <Drill className="w-5 h-5" />}
                     </div>
                     <div>
                        <h4 className="font-black text-sm uppercase tracking-tight text-on-surface">{req.type} Request</h4>
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{req.siteId} / {req.requestedBy}</p>
                     </div>
                  </div>
                </div>

                <div className="p-4 bg-surface rounded-2xl space-y-2 border border-outline-variant/10">
                   <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Specifications:</p>
                   <p className="text-xs font-bold uppercase leading-relaxed text-on-surface">{req.details}</p>
                   <div className="pt-2 border-t border-outline-variant/10">
                      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Site Rationale:</p>
                      <p className="text-[10px] font-bold uppercase leading-relaxed text-on-surface italic">"{req.reason}"</p>
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                     onClick={() => alert(`Signal ${req.id} Approved. Logistics pipeline activated for ${req.siteId}.`)}
                     className="py-4 bg-primary text-on-primary rounded-2xl font-black text-[10px] uppercase tracking-widest active-press"
                  >
                     Approve Allocation
                  </button>
                  <button 
                     onClick={() => alert(`Signal ${req.id} Declined. Reason sent to supervisor.`)}
                     className="py-4 bg-white border border-error/30 text-error rounded-2xl font-black text-[10px] uppercase tracking-widest active-press"
                  >
                     Reject Signal
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <AnimatePresence>
        {mergingField && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-on-surface/60 backdrop-blur-sm flex items-end p-0"
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-white w-full rounded-t-[3rem] p-10 space-y-10 shadow-2xl pb-16"
            >
              <div className="flex justify-between items-center max-w-[800px] mx-auto w-full">
                <h3 className="font-headline font-black text-2xl uppercase text-error tracking-tighter">System Redirection Protocol</h3>
                <button onClick={() => setMergingField(null)} className="p-3 bg-error/10 text-error rounded-full hover:bg-error/20 transition-all"><Close className="w-8 h-8" /></button>
              </div>
              <div className="max-w-[800px] mx-auto w-full space-y-10">
                <div className="bg-error/5 p-8 border border-error/10 rounded-[32px]">
                  <p className="text-sm font-bold text-on-surface leading-loose uppercase tracking-[0.05em]">
                    Redirection request for <span className="text-error font-black">"{mergingField}"</span>. Unverified data telemetry detected. Mapping to existing Master Dictionary node is required to prevent registry fragmentation.
                  </p>
                </div>

                <div className="space-y-6">
                  <label className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant ml-1">Target Mapping Nodes:</label>
                  <div className="grid grid-cols-1 gap-4 max-h-72 overflow-y-auto pr-4 no-scrollbar">
                    {['Quantity Received', 'Portland Cement Standard', 'Bulk Cement Import', 'High Grade SCM', 'Aggregate 20mm'].map(f => (
                      <button 
                        key={f}
                        onClick={() => setMergingField(null)}
                        className="w-full text-left p-6 bg-surface-container hover:bg-primary/10 hover:border-primary border border-transparent rounded-[24px] transition-all flex justify-between items-center group shadow-sm"
                      >
                        <span className="text-sm font-black uppercase text-on-surface group-hover:text-primary transition-colors tracking-wide">{f}</span>
                        <ArrowRight className="w-6 h-6 text-primary scale-0 group-hover:scale-100 transition-all" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ArrowRight = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14m-7-7 7 7-7 7"/>
  </svg>
);
