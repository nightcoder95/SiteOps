import React, { useState } from 'react';
import { ChevronLeft, Plus, ArrowLeftRight, X, Check, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Site, MaterialEntry, MaterialType, MATERIAL_TYPES, MATERIAL_UNITS } from '../../types';

interface MaterialsEntryViewProps {
  site: Site | null;
  entries: MaterialEntry[];
  sites: Site[];
  onAddEntry: (entry: Omit<MaterialEntry, 'id'>) => void;
  onTransfer: (entryId: string, targetSiteId: string) => void;
  goBack: () => void;
}

type AddForm = { material: MaterialType; quantity: string; remarks: string };

const MATERIAL_COLORS: Record<MaterialType, string> = {
  'Cement':  'bg-stone-50 text-stone-600',
  'M-Sand':  'bg-amber-50 text-amber-600',
  'P-Sand':  'bg-yellow-50 text-yellow-700',
  'Metal':   'bg-slate-50 text-slate-600',
};

export function MaterialsEntryView({ site, entries, sites, onAddEntry, onTransfer, goBack }: MaterialsEntryViewProps) {
  const today = new Date().toISOString().split('T')[0];
  const siteEntries = entries.filter(e => e.siteId === site?.id);
  const todayEntries = siteEntries.filter(e => e.date === today);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddForm>({ material: 'Cement', quantity: '', remarks: '' });
  const [transferEntry, setTransferEntry] = useState<MaterialEntry | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!site || !form.quantity) return;
    onAddEntry({
      siteId: site.id,
      date: today,
      material: form.material,
      quantity: parseFloat(form.quantity),
      unit: MATERIAL_UNITS[form.material],
      remarks: form.remarks,
    });
    setForm({ material: 'Cement', quantity: '', remarks: '' });
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

  const summaryByMaterial = MATERIAL_TYPES.reduce((acc, mt) => {
    const total = todayEntries.filter(e => e.material === mt).reduce((s, e) => s + e.quantity, 0);
    acc[mt] = total;
    return acc;
  }, {} as Record<MaterialType, number>);

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
          <h2 className="font-headline font-black uppercase text-sm tracking-tight text-on-surface">Materials Tracking</h2>
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

      {/* Today Summary Grid */}
      <div className="px-5 py-4 bg-white border-b border-outline-variant/10">
        <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-60 mb-3">Today's Intake</p>
        <div className="grid grid-cols-4 gap-2">
          {MATERIAL_TYPES.map(mt => (
            <div key={mt} className={`rounded-xl p-2.5 text-center ${MATERIAL_COLORS[mt]}`}>
              <p className="font-black text-sm leading-none">{summaryByMaterial[mt] || 0}</p>
              <p className="text-[8px] font-bold uppercase tracking-widest opacity-70 mt-0.5">{MATERIAL_UNITS[mt]}</p>
              <p className="text-[7px] font-black uppercase tracking-widest mt-0.5 opacity-80">{mt}</p>
            </div>
          ))}
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
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full inline-block mb-2 ${MATERIAL_COLORS[entry.material]}`}>
                    {entry.material}
                  </span>
                  <p className="font-headline font-black text-2xl text-on-surface">
                    {entry.quantity} <span className="text-sm font-bold text-on-surface-variant">{entry.unit}</span>
                  </p>
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
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${MATERIAL_COLORS[entry.material]}`}>
                        {entry.material}
                      </span>
                      <span className="font-bold text-sm">{entry.quantity} {entry.unit}</span>
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
            <Package className="w-12 h-12 text-on-surface-variant/20 mx-auto" />
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
              className="w-full bg-white rounded-t-[32px] p-8 space-y-6 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-headline font-black text-lg uppercase tracking-tight">Log Material Entry</h3>
                <button onClick={() => setShowForm(false)} className="p-2 bg-surface rounded-full active-press">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Material Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {MATERIAL_TYPES.map(mt => (
                      <button
                        key={mt}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, material: mt }))}
                        className={`p-3 rounded-xl text-left transition-all active-press ${
                          form.material === mt
                            ? 'machined-gradient text-white shadow-md shadow-primary/20'
                            : 'bg-surface text-on-surface-variant border border-outline-variant/30'
                        }`}
                      >
                        <p className={`font-black text-xs uppercase ${form.material === mt ? 'text-white' : ''}`}>{mt}</p>
                        <p className={`text-[9px] font-bold uppercase mt-0.5 ${form.material === mt ? 'text-white/70' : 'text-on-surface-variant/60'}`}>{MATERIAL_UNITS[mt]}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                      Quantity ({MATERIAL_UNITS[form.material]})
                    </label>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      required
                      value={form.quantity}
                      onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                      placeholder="0"
                      className="w-full h-14 bg-surface border border-outline-variant/30 rounded-xl px-4 font-black text-xl outline-none focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Unit</label>
                    <div className="h-14 bg-surface-container border border-outline-variant/20 rounded-xl px-4 flex items-center">
                      <span className="font-black text-on-surface-variant">{MATERIAL_UNITS[form.material]}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Remarks</label>
                  <textarea
                    value={form.remarks}
                    onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                    placeholder="Vendor name, grade, notes..."
                    rows={2}
                    className="w-full bg-surface border border-outline-variant/30 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary transition-all resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!form.quantity}
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
                  <h3 className="font-headline font-black text-lg uppercase tracking-tight">Transfer Material</h3>
                  <p className="text-[10px] text-on-surface-variant mt-1 uppercase tracking-widest">
                    {transferEntry.material} — {transferEntry.quantity} {transferEntry.unit}
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
