import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, MapPin, ArrowRight } from 'lucide-react';
import { Site, MOCK_SITES, View } from '../../types';

interface SiteSelectionViewProps {
  onSelectSite: (site: Site) => void;
  navigate: (view: View) => void;
}

export function SiteSelectionView({ onSelectSite, navigate }: SiteSelectionViewProps) {
  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden">
      <header className="p-4 flex items-center gap-4 bg-white border-b border-outline-variant/30 sticky top-0 z-10">
        <button onClick={() => navigate('HOME')} className="p-2 -ml-2 active-press">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="font-headline font-black uppercase text-sm tracking-widest text-on-surface">Target Worksite</h2>
      </header>

      <main className="flex-grow overflow-y-auto p-6 space-y-4">
        <div className="mb-6">
          <p className="text-on-surface-variant text-xs font-bold uppercase tracking-wider mb-2">Location Required</p>
          <h1 className="text-2xl font-black uppercase leading-none">Select active<br/>sector for registry.</h1>
        </div>

        {MOCK_SITES.map((site) => (
          <button
            key={site.id}
            onClick={() => {
              onSelectSite(site);
              navigate('ENTRY_CATEGORIES');
            }}
            className="w-full text-left bg-white p-6 rounded-2xl border border-outline-variant/30 shadow-sm flex items-center justify-between group active-press transition-all hover:border-primary"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <MapPin className="w-3 h-3 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{site.location}</span>
              </div>
              <h3 className="text-lg font-black uppercase">{site.name}</h3>
              <p className="text-xs font-bold text-on-surface-variant uppercase">{site.phase}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
              <ArrowRight className="w-5 h-5" />
            </div>
          </button>
        ))}
      </main>
    </div>
  );
}
