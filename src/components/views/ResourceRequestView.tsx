import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Send, Package, Users, Wallet, Drill } from 'lucide-react';
import { View, ResourceRequest, Site, MOCK_SITES } from '../../types';

interface ResourceRequestViewProps {
  navigate: (view: View) => void;
  onSubmit: (request: Partial<ResourceRequest>) => void;
}

export function ResourceRequestView({ navigate, onSubmit }: ResourceRequestViewProps) {
  const [type, setType] = useState<ResourceRequest['type']>('Labour');
  const [siteId, setSiteId] = useState(MOCK_SITES[0].id);
  const [details, setDetails] = useState('');
  const [reason, setReason] = useState('');

  const types: { val: ResourceRequest['type']; icon: any }[] = [
    { val: 'Labour', icon: Users },
    { val: 'Materials', icon: Package },
    { val: 'Money', icon: Wallet },
    { val: 'Machinery', icon: Drill },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      type,
      siteId,
      details,
      reason,
      status: 'Pending',
      timestamp: new Date().toISOString(),
      requestedBy: 'Supervisor Alpha'
    });
    alert('Logistics Request Signal Sent. Admin review initiated.');
    navigate('HOME');
  };

  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden">
      <header className="p-4 flex items-center gap-4 bg-white border-b border-outline-variant/30 sticky top-0 z-10">
        <button onClick={() => navigate('HOME')} className="p-2 -ml-2 active-press">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="font-headline font-black uppercase text-sm tracking-widest text-on-surface">Raise Request</h2>
      </header>

      <main className="flex-grow overflow-y-auto p-6 space-y-8">
        <div className="space-y-1">
          <p className="text-on-surface-variant text-xs font-black uppercase tracking-widest">Resource Acquisition</p>
          <h1 className="text-2xl font-black uppercase leading-tight">Propose additional site resources.</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8 pb-32">
          {/* Request Type */}
          <div className="space-y-4">
            <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Request Category</label>
            <div className="grid grid-cols-2 gap-3">
              {types.map((t) => (
                <button
                  key={t.val}
                  type="button"
                  onClick={() => setType(t.val)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all active-press ${
                    type === t.val ? 'bg-primary border-primary text-white' : 'bg-white border-outline-variant/30 text-on-surface'
                  }`}
                >
                  <t.icon className={`w-6 h-6 ${type === t.val ? 'text-white' : 'text-primary'}`} />
                  <span className="text-[10px] font-black uppercase tracking-tight">{t.val}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Site Selection */}
          <div className="space-y-4">
            <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Target Worksite</label>
            <select 
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="w-full bg-white p-4 rounded-2xl border border-outline-variant/30 font-bold text-sm uppercase outline-none focus:border-primary"
            >
              {MOCK_SITES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Details */}
          <div className="space-y-4">
            <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Resource Specifications</label>
            <textarea
              required
              placeholder="E.g., 20 MT Cement, Grade 53..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full bg-white p-4 rounded-2xl border border-outline-variant/30 font-bold text-sm uppercase min-h-[100px] outline-none focus:border-primary"
            />
          </div>

          {/* Reason */}
          <div className="space-y-4">
            <label className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Operational Justification</label>
            <textarea
              required
              placeholder="Why is this resource required?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-white p-4 rounded-2xl border border-outline-variant/30 font-bold text-sm uppercase min-h-[100px] outline-none focus:border-primary"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-primary text-white p-6 rounded-3xl flex items-center justify-center gap-3 active-press shadow-lg shadow-primary/20"
          >
            <span className="font-black uppercase tracking-widest">Broadcast Request</span>
            <Send className="w-5 h-5" />
          </button>
        </form>
      </main>
    </div>
  );
}
