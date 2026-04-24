import React from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, User, MapPin, Clock, CheckCircle2 } from 'lucide-react';
import { View, Entry, MOCK_SITES } from '../../types';

interface LiveFeedViewProps {
  entries: Entry[];
  navigate: (view: View) => void;
}

export function LiveFeedView({ entries, navigate }: LiveFeedViewProps) {
  // Mock recent feed if no entries
  const feedItems = entries.length > 0 ? entries : [
    { id: '1', siteId: 'oak-tower', categoryId: 'labour', subcategoryId: 'skilled', timestamp: new Date().toISOString(), data: {}, status: 'unverified' },
    { id: '2', siteId: 'bridge-proj', categoryId: 'materials', subcategoryId: 'cement', timestamp: new Date(Date.now() - 3600000).toISOString(), data: {}, status: 'verified' },
  ];

  const getSiteName = (id: string) => MOCK_SITES.find(s => s.id === id)?.name || id;

  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden">
      <header className="p-4 flex items-center gap-4 bg-white border-b border-outline-variant/30 sticky top-0 z-10">
        <button onClick={() => navigate('HOME')} className="p-2 -ml-2 active-press">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h2 className="font-headline font-black uppercase text-sm tracking-widest text-on-surface">Live Signal Feed</h2>
      </header>

      <main className="flex-grow overflow-y-auto p-6 space-y-4">
        <div className="mb-6">
          <p className="text-on-surface-variant text-xs font-black uppercase tracking-widest mb-1">Supervisor Broadcasts</p>
          <h1 className="text-2xl font-black uppercase leading-tight">Incoming updates from active sectors.</h1>
        </div>

        <div className="relative border-l-2 border-outline-variant/30 ml-3 pl-8 space-y-8">
          {feedItems.map((item, idx) => (
            <motion.div 
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="relative"
            >
              <div className="absolute -left-[41px] top-0 w-6 h-6 rounded-full bg-white border-2 border-primary flex items-center justify-center shadow-sm">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              </div>
              
              <div className="bg-white p-5 rounded-2xl border border-outline-variant/30 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <User className="w-3 h-3 text-on-surface-variant" />
                    <span className="text-[10px] font-black uppercase tracking-tight">Supervisor ID: #9201</span>
                  </div>
                  <div className="flex items-center gap-1 text-on-surface-variant">
                    <Clock className="w-3 h-3" />
                    <span className="text-[10px] font-bold">
                       {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <div>
                   <h3 className="font-black text-sm uppercase tracking-tight">{getSiteName(item.siteId)}</h3>
                   <p className="text-xs font-bold text-primary uppercase">{item.categoryId} / {item.subcategoryId}</p>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-outline-variant/10">
                   <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-on-surface-variant" />
                      <span className="text-[10px] font-bold text-on-surface-variant uppercase">East Sector</span>
                   </div>
                   {item.status === 'verified' ? (
                      <div className="flex items-center gap-1 text-success">
                         <CheckCircle2 className="w-3 h-3" />
                         <span className="text-[10px] font-black uppercase">Confirmed</span>
                      </div>
                   ) : (
                      <span className="text-[10px] font-black uppercase text-on-surface-variant bg-surface px-2 py-0.5 rounded">Awaiting Validation</span>
                   )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
