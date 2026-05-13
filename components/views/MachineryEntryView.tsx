import React, { useState } from 'react';
import { ChevronLeft, Plus, ArrowLeftRight, X, Check, Truck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Site, MachineryEntry, MachineryType, MACHINERY_TYPES } from '@/lib/types/legacy';

interface MachineryEntryViewProps {
  site: Site | null;
  entries: MachineryEntry[];
  sites: Site[];
  onAddEntry: (entry: Omit<MachineryEntry, 'id'>) => void;
  onTransfer: (entryId: string, targetSiteId: string) => void;
  goBack: () => void;
}

type AddForm = { equipment: MachineryType; count: string; hoursActive: string; remarks: string };

const EQUIPMENT_COLORS: Record<MachineryType, string> = {
  'Excavator':      'bg-amber-50 text-amber-700',
  'Tower Crane':    'bg-blue-50 text-blue-700',
  'Concrete Mixer': 'bg-stone-50 text-stone-700',
  'Bulldozer':      'bg-orange-50 text-orange-700',
  'Compactor':      'bg-purple-50 text-purple-700',
  'Generator':      'bg-yellow-50 text-yellow-700',
  'Water Tanker':   'bg-cyan-50 text-cyan-700',
  'Transit Mixer':  'bg-green-50 text-green-700',
};

export function MachineryEntryView({ site, entries, sites, onAddEntry, onTransfer, goBack }: MachineryEntryViewProps) {
  const today = new Date().toISOString().split('T')[0];
  const siteEntries = entries.filter(e => e.siteId === site?.id);
  const todayEntries = siteEntries.filter(e => e.date === today);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddForm>({ equipment: 'Excavator', count: '', hoursActive: '', remarks: '' });
  const [transferEntry, setTransferEntry] = useState<MachineryEntry | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!site || !form.count || !form.hoursActive) return;
    onAddEntry({
      siteId: site.id,
      date: today,
      equipment: form.equipment,
      count: parseInt(form.count),
      hoursActive: parseFloat(form.hoursActive),
      remarks: form.remarks,
    });
    setForm({ equipment: 'Excavator', count: '', hoursActive: '', remarks: '' });
    setShowForm(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTransferConfirm = (targetSiteId: string) => {
    if (transferEntry) {
      onTransfer(transferEntry.id, targetSiteId);
      setTransferEntry(null);
    }
  };

  const otherSites = sites.filter(s => s.id !== site?.id);
  const totalUnits = todayEntries.reduce((s, e) => s + e.count, 0);
  const totalHours = todayEntries.reduce((s, e) => s + e.hoursActive, 0);

  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden">
      <header className="p-4 flex items-center gap-4 bg-white border-b border-outline-variant/30 sticky top-0 z-10">
        <button
          onClick={goBack}
          className="w-10 h-10 bg-on-surface text-surface rounded-xl flex items-center justify-center active-press shadow-lg shadow-on-surface/20"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-60">{site?.name}</p>
          <h2 className="font-headline font-black uppercase text-sm tracking-tight text-on-surface">Machinery & Equipment</h2>
        </div>
        <AnimatePresence>
          {saved && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
              className="flex items-center gap-1.5 bg-green-100 text-green-700 px-3 py-1.5 rounded-xl"
            >
              <Check className="w-3.5 h-3.5" />
              <span className="text-[10px] font-black uppercase tracking-widest">Saved</span>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => setShowForm(true)}
          className="w-10 h-10 machined-gradient text-white rounded-xl flex items-center justify-center active-press shadow-lg shadow-primary/20"
        >
          <Plus className="w-5 h-5" />
        </button>
      </header>

      {/* Today Summary */}
      <div className="px-5 py-4 bg-white border-b border-outline-variant/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <Truck className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-60">Today Active</p>
            <p className="font-headline font-black text-xl text-on-surface">{totalUnits} <span className="text-sm font-bold text-on-surface-variant">units</span></p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-60">Total Hours</p>
          <p className="font-black text-lg">{totalHours}<span className="text-sm font-bold text-on-surface-variant"> hrs</span></p>
        </div>
      </div>

      <main className="flex-grow overflow-y-auto no-scrollbar pb-28 p-5 space-y-3">
        {todayEntries.length > 0 && (
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Today — {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
        )}

        <AnimatePresence>
          {todayEntries.map((entry, i) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="bg-white rounded-2xl border border-outline-variant/20 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full inline-block mb-2 ${EQUIPMENT_COLORS[entry.equipment]}`}>
                    {entry.equipment}
                  </span>
                  <div className="flex items-baseline gap-4">
                    <p className="font-headline font-black text-2xl text-on-surface">
                      {entry.count} <span className="text-sm font-bold text-on-surface-variant">units</span>
                    </p>
                    <p className="font-bold text-base text-on-surface-variant">
                      {entry.hoursActive} <span className="text-xs">hrs</span>
                    </p>
                  </div>
                  {entry.remarks && <p className="text-[10px] text-on-surface-variant mt-1 leading-relaxed">{entry.remarks}</p>}
                </div>
                <button
                  onClick={() => setTransferEntry(entry)}
                  className="p-2 rounded-xl border border-outline-variant/20 active-press hover:border-primary/30 hover:bg-primary/5 transition-all shrink-0"
                  title="Transfer to another site"
                >
                  <ArrowLeftRight className="w-4 h-4 text-on-surface-variant" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {siteEntries.filter(e => e.date !== today).length > 0 && (
          <>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant pt-2">Previous Entries</p>
            {siteEntries
              .filter(e => e.date !== today)
              .sort((a, b) => b.date.localeCompare(a.date))
              .map(entry => (
                <div key={entry.id} className="bg-white rounded-2xl border border-outline-variant/20 p-4 shadow-sm opacity-70">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${EQUIPMENT_COLORS[entry.equipment]}`}>
                        {entry.equipment}
                      </span>
                      <span className="font-bold text-sm">{entry.count} units · {entry.hoursActive} hrs</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-on-surface-variant font-bold">{new Date(entry.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                      <button onClick={() => setTransferEntry(entry)} className="p-1.5 rounded-lg border border-outline-variant/20 active-press">
                        <ArrowLeftRight className="w-3.5 h-3.5 text-on-surface-variant" />
                      </button>
                    </div>
                  </div>
                  {entry.remarks && <p className="text-[10px] text-on-surface-variant mt-1.5">{entry.remarks}</p>}
                </div>
              ))}
          </>
        )}

        {siteEntries.length === 0 && (
          <div className="py-16 text-center space-y-3">
            <Truck className="w-12 h-12 text-on-surface-variant/20 mx-auto" />
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-40">No entries yet</p>
          </div>
        )}
      </main>

      {/* Add Entry Sheet */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="w-full bg-white rounded-t-[32px] p-8 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-headline font-black text-lg uppercase tracking-tight">Log Equipment</h3>
                <button onClick={() => setShowForm(false)} className="p-2 bg-surface rounded-full active-press">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Equipment Type</label>
                  <div className="flex flex-wrap gap-2">
                    {MACHINERY_TYPES.map(mt => (
                      <button
                        key={mt}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, equipment: mt }))}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all active-press ${
                          form.equipment === mt
                            ? 'machined-gradient text-white shadow-md shadow-primary/20'
                            : 'bg-surface text-on-surface-variant border border-outline-variant/30'
                        }`}
                      >
                        {mt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Units Active</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={form.count}
                      onChange={e => setForm(f => ({ ...f, count: e.target.value }))}
                      placeholder="0"
                      className="w-full h-14 bg-surface border border-outline-variant/30 rounded-xl px-4 font-black text-xl outline-none focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Hours Active</label>
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      required
                      value={form.hoursActive}
                      onChange={e => setForm(f => ({ ...f, hoursActive: e.target.value }))}
                      placeholder="0"
                      className="w-full h-14 bg-surface border border-outline-variant/30 rounded-xl px-4 font-black text-xl outline-none focus:border-primary transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Remarks</label>
                  <textarea
                    value={form.remarks}
                    onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                    placeholder="Usage notes, operator info..."
                    rows={2}
                    className="w-full bg-surface border border-outline-variant/30 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary transition-all resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!form.count || !form.hoursActive}
                  className="w-full h-14 machined-gradient text-white font-headline font-black uppercase tracking-widest rounded-xl disabled:opacity-50 active-press shadow-lg shadow-primary/20"
                >
                  Save Entry
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transfer Modal */}
      <AnimatePresence>
        {transferEntry && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end"
            onClick={() => setTransferEntry(null)}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="w-full bg-white rounded-t-[32px] p-8 space-y-5 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-headline font-black text-lg uppercase tracking-tight">Transfer Equipment</h3>
                  <p className="text-[10px] text-on-surface-variant mt-1 uppercase tracking-widest">
                    {transferEntry.equipment} — {transferEntry.count} units
                  </p>
                </div>
                <button onClick={() => setTransferEntry(null)} className="p-2 bg-surface rounded-full active-press">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Select destination site:</p>
              <div className="space-y-2">
                {otherSites.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleTransferConfirm(s.id)}
                    className="w-full p-4 bg-surface rounded-2xl border border-outline-variant/20 flex items-center justify-between active-press hover:border-primary/30 transition-all"
                  >
                    <div className="text-left">
                      <p className="font-black text-sm uppercase">{s.name}</p>
                      <p className="text-[9px] text-on-surface-variant uppercase tracking-widest">{s.location} · {s.phase.split(':')[0]}</p>
                    </div>
                    <ArrowLeftRight className="w-4 h-4 text-primary" />
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
