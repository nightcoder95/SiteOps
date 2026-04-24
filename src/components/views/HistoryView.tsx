import React, { useState, useMemo } from 'react';
import { Search, ArrowLeft, Filter, Trash2, Edit3, MapPin, Tag, Calendar } from 'lucide-react';
import { View, Entry, MOCK_SITES, MASTER_DICTIONARY, HistoryFilter } from '../../types';

interface HistoryViewProps {
  navigate: (view: View) => void;
  entries: Entry[];
  onDeleteEntry: (id: string) => void;
  onEditEntry: (entry: Entry) => void;
  initialFilter?: HistoryFilter;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ 
  navigate, 
  entries, 
  onDeleteEntry, 
  onEditEntry,
  initialFilter = {}
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>(initialFilter);
  const [showFilters, setShowFilters] = useState(false);

  const filteredEntries = useMemo(() => {
    return entries.filter(entry => {
      const site = MOCK_SITES.find(s => s.id === entry.siteId);
      const siteMatch = !filter.siteId || entry.siteId === filter.siteId;
      const categoryMatch = !filter.categoryId || entry.categoryId === filter.categoryId;
      const dateMatch = !filter.date || entry.timestamp.startsWith(filter.date);
      const searchMatch = !searchTerm || 
        site?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.subcategoryId.toLowerCase().includes(searchTerm.toLowerCase());
      
      return siteMatch && categoryMatch && dateMatch && searchMatch;
    });
  }, [entries, filter, searchTerm]);

  return (
    <div className="min-h-full bg-surface flex flex-col">
      <header className="h-20 flex items-center px-8 bg-white sticky top-0 z-50 border-b border-outline-variant/30">
        <button onClick={() => navigate('HOME')} className="mr-6 p-2 bg-surface rounded-xl border border-outline-variant/30 active-press transition-all">
          <ArrowLeft className="w-6 h-6 text-primary" />
        </button>
        <h2 className="font-headline font-black uppercase text-sm tracking-widest text-on-surface">Signal Archive</h2>
        <button 
          onClick={() => setShowFilters(!showFilters)}
          className={`ml-auto p-2 rounded-xl transition-colors active-press ${showFilters ? 'bg-primary text-white' : 'text-primary'}`}
        >
          <Filter className="w-6 h-6" />
        </button>
      </header>
      
      <main className="p-8 space-y-6 max-w-[800px] mx-auto w-full pb-32">
        <div className="mb-4">
          <p className="text-on-surface-variant text-[10px] font-black uppercase tracking-widest">Registry Logs</p>
          <h1 className="text-2xl font-black uppercase leading-tight">Historical Site<br/>Protocol entries.</h1>
        </div>

        {showFilters && (
          <div className="bg-white p-6 rounded-3xl border border-outline-variant/30 shadow-lg space-y-4 animate-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-on-surface-variant">Worksite</label>
                <select 
                  value={filter.siteId || ''} 
                  onChange={(e) => setFilter({...filter, siteId: e.target.value || undefined})}
                  className="w-full bg-surface p-3 rounded-xl border-none text-[10px] font-bold uppercase outline-none"
                >
                  <option value="">All Sites</option>
                  {MOCK_SITES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-on-surface-variant">Category</label>
                <select 
                  value={filter.categoryId || ''} 
                  onChange={(e) => setFilter({...filter, categoryId: e.target.value || undefined})}
                  className="w-full bg-surface p-3 rounded-xl border-none text-[10px] font-bold uppercase outline-none"
                >
                  <option value="">All Categories</option>
                  {MASTER_DICTIONARY.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white p-6 rounded-2xl border border-outline-variant/30 shadow-sm flex items-center gap-4 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
          <Search className="w-5 h-5 text-on-surface-variant" />
          <input 
            className="bg-transparent border-none focus:ring-0 text-xs font-bold uppercase tracking-widest w-full outline-none" 
            placeholder="Search signals..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="space-y-4">
          {filteredEntries.length === 0 ? (
            <div className="py-20 text-center space-y-4">
              <div className="w-16 h-16 bg-surface rounded-full flex items-center justify-center mx-auto text-outline-variant">
                <Search size={32} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">No matching records found.</p>
            </div>
          ) : (
            filteredEntries.map(entry => {
              const site = MOCK_SITES.find(s => s.id === entry.siteId);
              const category = MASTER_DICTIONARY.find(c => c.id === entry.categoryId);
              
              return (
                <div 
                  key={entry.id} 
                  className="w-full text-left bg-white p-6 rounded-3xl border border-outline-variant/30 shadow-sm space-y-4 transition-all hover:border-primary/50 group relative"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter">
                          {site?.name || 'Unknown Site'}
                        </span>
                        <span className="bg-surface text-on-surface-variant px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter">
                          {category?.name || entry.categoryId}
                        </span>
                      </div>
                      <h4 className="font-black text-base uppercase tracking-tight">{entry.subcategoryId.replace(/-/g, ' ')}</h4>
                      <p className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest opacity-60">ID: {entry.id}</p>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      <div className="flex gap-2 transition-opacity group-hover:opacity-100 opacity-60 md:opacity-0 group-hover:md:opacity-100">
                        <button 
                          onClick={() => onEditEntry(entry)}
                          className="p-2 bg-surface rounded-lg text-primary active-press ring-1 ring-primary/20"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button 
                          onClick={() => onDeleteEntry(entry.id)}
                          className="p-2 bg-surface rounded-lg text-error active-press ring-1 ring-error/20"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <p className="text-[10px] font-black uppercase text-primary">
                        {new Date(entry.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-surface">
                    {Object.entries(entry.data).slice(0, 2).map(([key, val]) => (
                      <div key={key}>
                        <p className="text-[8px] font-black uppercase text-on-surface-variant opacity-60">{key}</p>
                        <p className="font-bold text-xs uppercase truncate">{String(val)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
};
