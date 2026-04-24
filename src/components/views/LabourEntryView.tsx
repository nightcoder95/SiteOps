import React, { useState } from 'react';
import { ChevronLeft, Plus, ArrowLeftRight, X, Check, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Site, LabourEntry, LabourWorkType, LABOUR_WORK_TYPES } from '../../types';

interface LabourEntryViewProps {
  site: Site | null;
  entries: LabourEntry[];
  sites: Site[];
  onAddEntry: (entry: Omit<LabourEntry, 'id'>) => void;
  onTransfer: (entryId: string, targetSiteId: string) => void;
  goBack: () => void;
}

type AddForm = { workType: LabourWorkType; peopleCount: string; remarks: string };

const WORK_TYPE_COLORS: Record<LabourWorkType, string> = {
  'Steelwork':     'bg-red-50 text-red-600',
  'Shuttering':    'bg-amber-50 text-amber-600',
  'Brickwork':     'bg-orange-50 text-orange-600',
  'Concretework':  'bg-stone-50 text-stone-600',
  'Plastering':    'bg-lime-50 text-lime-600',
  'Electric Work': 'bg-yellow-50 text-yellow-700',
  'Plumbing':      'bg-blue-50 text-blue-600',
  'Pile Work':     'bg-purple-50 text-purple-600',
  'Wood Work':     'bg-emerald-50 text-emerald-600',
  'Paint Work':    'bg-pink-50 text-pink-600',
};

export function LabourEntryView({ site, entries, sites, onAddEntry, onTransfer, goBack }: LabourEntryViewProps) {
  const today = new Date().toISOString().split('T')[0];
  const siteEntries = entries.filter(e => e.siteId === site?.id);
  const todayEntries = siteEntries.filter(e => e.date === today);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddForm>({ workType: 'Steelwork', peopleCount: '', remarks: '' });
  const [transferEntry, setTransferEntry] = useState<LabourEntry | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!site || !form.peopleCount) return;
    onAddEntry({
      siteId: site.id,
      date: today,
      workType: form.workType,
      peopleCount: parseInt(form.peopleCount),
      remarks: form.remarks,
    });
    setForm({ workType: 'Steelwork', peopleCount: '', remarks: '' });
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

  const totalWorkers = todayEntries.reduce((s, e) => s + e.peopleCount, 0);
  const otherSites = sites.filter(s => s.id !== site?.id);

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
          <h2 className="font-headline font-black uppercase text-sm tracking-tight text-on-surface">Labour Tracking</h2>
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
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-60">Today's Total</p>
            <p className="font-headline font-black text-xl text-on-surface">{totalWorkers} <span className="text-sm font-bold text-on-surface-variant">workers</span></p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-60">Entries</p>
          <p className="font-black text-lg">{todayEntries.length}</p>
        </div>
      </div>

      <main className="flex-grow overflow-y-auto no-scrollbar pb-28 p-5 space-y-3">
        {/* Today's entries */}
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${WORK_TYPE_COLORS[entry.workType]}`}>
                      {entry.workType}
                    </span>
                  </div>
                  <p className="font-headline font-black text-2xl text-on-surface">{entry.peopleCount} <span className="text-sm font-bold text-on-surface-variant">people</span></p>
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

        {/* Past entries */}
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
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${WORK_TYPE_COLORS[entry.workType]}`}>
                        {entry.workType}
                      </span>
                      <span className="font-bold text-sm">{entry.peopleCount} people</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-on-surface-variant font-bold">{new Date(entry.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                      <button
                        onClick={() => setTransferEntry(entry)}
                        className="p-1.5 rounded-lg border border-outline-variant/20 active-press"
                      >
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
            <Users className="w-12 h-12 text-on-surface-variant/20 mx-auto" />
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-40">No entries yet</p>
            <p className="text-[10px] text-on-surface-variant opacity-30">Tap + to log labour for this site</p>
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
                <h3 className="font-headline font-black text-lg uppercase tracking-tight">Log Labour Entry</h3>
                <button onClick={() => setShowForm(false)} className="p-2 bg-surface rounded-full active-press">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Work Type</label>
                  <div className="flex flex-wrap gap-2">
                    {LABOUR_WORK_TYPES.map(wt => (
                      <button
                        key={wt}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, workType: wt }))}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all active-press ${
                          form.workType === wt
                            ? 'machined-gradient text-white shadow-md shadow-primary/20'
                            : 'bg-surface text-on-surface-variant border border-outline-variant/30'
                        }`}
                      >
                        {wt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">No. of People</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={form.peopleCount}
                      onChange={e => setForm(f => ({ ...f, peopleCount: e.target.value }))}
                      placeholder="0"
                      className="w-full h-14 bg-surface border border-outline-variant/30 rounded-xl px-4 font-black text-xl outline-none focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Date</label>
                    <input
                      type="date"
                      value={today}
                      readOnly
                      className="w-full h-14 bg-surface border border-outline-variant/30 rounded-xl px-4 font-bold text-sm outline-none text-on-surface-variant"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Remarks</label>
                  <textarea
                    value={form.remarks}
                    onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                    placeholder="Add notes about this work..."
                    rows={2}
                    className="w-full bg-surface border border-outline-variant/30 rounded-xl px-4 py-3 font-medium text-sm outline-none focus:border-primary transition-all resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!form.peopleCount}
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
                  <h3 className="font-headline font-black text-lg uppercase tracking-tight">Transfer Entry</h3>
                  <p className="text-[10px] text-on-surface-variant mt-1 uppercase tracking-widest">
                    {transferEntry.workType} — {transferEntry.peopleCount} people
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
