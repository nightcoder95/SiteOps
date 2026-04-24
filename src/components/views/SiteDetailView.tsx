import React from 'react';
import { ChevronLeft, TrendingUp, Users, Wallet, Calendar, ArrowRight } from 'lucide-react';
import { Site, View, HistoryFilter } from '../../types';

interface SiteDetailViewProps {
  site: Site | null;
  navigate: (view: View, filter?: HistoryFilter) => void;
}

export function SiteDetailView({ site, navigate }: SiteDetailViewProps) {
  if (!site) return null;

  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden">
      <header className="p-4 flex items-center gap-4 bg-white border-b border-outline-variant/30 sticky top-0 z-10">
        <button
          onClick={() => navigate('HOME')}
          className="w-10 h-10 bg-on-surface text-surface rounded-xl flex items-center justify-center active-press shadow-lg shadow-on-surface/20"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="font-headline font-black uppercase text-sm tracking-widest text-on-surface">Site Core: {site.name}</h2>
      </header>

      <main className="flex-grow overflow-y-auto p-6 space-y-6 pb-32">
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-on-surface-variant text-[10px] font-black uppercase tracking-widest leading-none mb-1">Active Sector</p>
              <h1 className="text-3xl font-black uppercase leading-none">{site.name}</h1>
            </div>
            <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${
              site.status === 'In Progress' ? 'bg-primary/10 text-primary' :
              site.status === 'Blocked' ? 'bg-error/10 text-error' : 'bg-green-100 text-green-600'
            }`}>
              {site.status}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => navigate('HISTORY', { siteId: site.id, categoryId: 'financials' })}
            className="bg-white p-6 text-left rounded-3xl border border-outline-variant/30 shadow-sm space-y-2 active-press group hover:border-primary"
          >
            <Wallet className="w-5 h-5 text-primary mb-2" />
            <p className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest">Site Spend</p>
            <p className="text-xl font-black">₹{(site.spend / 1000).toFixed(1)}K</p>
          </button>
          <button
            onClick={() => navigate('HISTORY', { siteId: site.id, categoryId: 'labour' })}
            className="bg-white p-6 text-left rounded-3xl border border-outline-variant/30 shadow-sm space-y-2 active-press group hover:border-primary"
          >
            <Users className="w-5 h-5 text-primary mb-2" />
            <p className="text-[10px] font-black uppercase text-on-surface-variant tracking-widest">Force Size</p>
            <p className="text-xl font-black">{site.headcount}</p>
          </button>
        </div>

        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Core Operations</h3>
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => navigate('RESOURCE_REQUEST')}
              className="flex items-center justify-between bg-white p-5 rounded-2xl border border-outline-variant/20 shadow-sm active-press group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-black uppercase leading-none">Raise Request</p>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase mt-1">Labor / Material / Asset</p>
                </div>
              </div>
              <ArrowRight size={18} className="text-outline-variant group-hover:text-primary transition-colors" />
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Active Site Health</h3>
          <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-outline-variant/20">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-black uppercase leading-none">Last Registry</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase">{site.lastUpdate}</p>
            </div>
          </div>
        </section>

        <button
          onClick={() => navigate('ENTRY_CATEGORIES')}
          className="w-full machined-gradient text-white p-6 rounded-3xl flex items-center justify-between active-press shadow-xl shadow-primary/20"
        >
          <span className="font-black uppercase tracking-widest text-sm">Update Site Log</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </main>
    </div>
  );
}
