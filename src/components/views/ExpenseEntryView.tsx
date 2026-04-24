import React, { useState } from 'react';
import { ChevronLeft, Plus, X, Check, Wallet, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Site, ExpenseEntry, ExpenseCategory, EXPENSE_CATEGORIES } from '../../types';

interface ExpenseEntryViewProps {
  site: Site | null;
  entries: ExpenseEntry[];
  onAddEntry: (entry: Omit<ExpenseEntry, 'id'>) => void;
  goBack: () => void;
}

type AddForm = { description: string; amount: string; category: ExpenseCategory; date: string };

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  'Labour':    'bg-blue-50 text-blue-700',
  'Materials': 'bg-green-50 text-green-700',
  'Equipment': 'bg-purple-50 text-purple-700',
  'Misc':      'bg-slate-50 text-slate-600',
};

const CATEGORY_ACCENT: Record<ExpenseCategory, string> = {
  'Labour':    'bg-blue-500',
  'Materials': 'bg-green-500',
  'Equipment': 'bg-purple-500',
  'Misc':      'bg-slate-400',
};

export function ExpenseEntryView({ site, entries, onAddEntry, goBack }: ExpenseEntryViewProps) {
  const today = new Date().toISOString().split('T')[0];
  const siteExpenses = entries.filter(e => e.siteId === site?.id).sort((a, b) => b.date.localeCompare(a.date));

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddForm>({ description: '', amount: '', category: 'Materials', date: today });
  const [saved, setSaved] = useState(false);
  const [filterCat, setFilterCat] = useState<ExpenseCategory | 'All'>('All');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!site || !form.description || !form.amount) return;
    onAddEntry({
      siteId: site.id,
      date: form.date,
      description: form.description,
      amount: parseFloat(form.amount),
      category: form.category,
      enteredBy: 'John Doe',
    });
    setForm({ description: '', amount: '', category: 'Materials', date: today });
    setShowForm(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const totalSpend = siteExpenses.reduce((s, e) => s + e.amount, 0);
  const byCategory = EXPENSE_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = siteExpenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
    return acc;
  }, {} as Record<ExpenseCategory, number>);

  const filtered = filterCat === 'All' ? siteExpenses : siteExpenses.filter(e => e.category === filterCat);

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
          <h2 className="font-headline font-black uppercase text-sm tracking-tight text-on-surface">Expenses</h2>
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

      {/* Total Spend Hero */}
      <div className="p-5 bg-white border-b border-outline-variant/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <Wallet className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-60">Total Spend</p>
              <p className="font-headline font-black text-2xl text-on-surface">
                ₹{totalSpend >= 100000
                  ? `${(totalSpend / 100000).toFixed(1)}L`
                  : `${(totalSpend / 1000).toFixed(0)}K`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-60">Budget</p>
            <p className="font-black text-sm">₹{((site?.budget || 0) / 100000).toFixed(1)}L</p>
            <div className="mt-1 w-20 h-1.5 bg-surface-container rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (totalSpend / (site?.budget || 1)) * 100)}%`,
                  background: totalSpend / (site?.budget || 1) > 0.8 ? '#EF4444' : '#F97316',
                }}
              />
            </div>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="grid grid-cols-4 gap-2">
          {EXPENSE_CATEGORIES.map(cat => (
            <div key={cat} className={`rounded-xl p-2 text-center ${CATEGORY_COLORS[cat]}`}>
              <p className="font-black text-xs">
                {byCategory[cat] >= 100000
                  ? `₹${(byCategory[cat] / 100000).toFixed(1)}L`
                  : `₹${(byCategory[cat] / 1000).toFixed(0)}K`}
              </p>
              <p className="text-[7px] font-black uppercase tracking-widest mt-0.5 opacity-80">{cat}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-5 py-3 bg-white border-b border-outline-variant/10 flex gap-2 overflow-x-auto no-scrollbar">
        {(['All', ...EXPENSE_CATEGORIES] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat)}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide whitespace-nowrap transition-all active-press ${
              filterCat === cat
                ? 'machined-gradient text-white shadow-sm'
                : 'bg-surface text-on-surface-variant border border-outline-variant/30'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <main className="flex-grow overflow-y-auto no-scrollbar pb-28 p-5 space-y-2">
        <AnimatePresence>
          {filtered.map((expense, i) => (
            <motion.div
              key={expense.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-white rounded-2xl border border-outline-variant/20 p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${CATEGORY_ACCENT[expense.category]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-sm text-on-surface leading-snug">{expense.description}</p>
                    <p className="font-headline font-black text-sm text-on-surface shrink-0">
                      ₹{expense.amount >= 1000
                        ? expense.amount >= 100000
                          ? `${(expense.amount / 100000).toFixed(1)}L`
                          : `${(expense.amount / 1000).toFixed(0)}K`
                        : expense.amount}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${CATEGORY_COLORS[expense.category]}`}>
                      {expense.category}
                    </span>
                    <span className="text-[9px] text-on-surface-variant font-bold">
                      {new Date(expense.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-[9px] text-on-surface-variant opacity-60">· {expense.enteredBy}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filtered.length === 0 && (
          <div className="py-16 text-center space-y-3">
            <TrendingUp className="w-12 h-12 text-on-surface-variant/20 mx-auto" />
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-40">No expenses logged</p>
          </div>
        )}
      </main>

      {/* Add Expense Sheet */}
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
                <h3 className="font-headline font-black text-lg uppercase tracking-tight">Add Expense</h3>
                <button onClick={() => setShowForm(false)} className="p-2 bg-surface rounded-full active-press">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Category</label>
                  <div className="grid grid-cols-2 gap-2">
                    {EXPENSE_CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, category: cat }))}
                        className={`p-3 rounded-xl text-left transition-all active-press ${
                          form.category === cat
                            ? 'machined-gradient text-white shadow-md shadow-primary/20'
                            : `${CATEGORY_COLORS[cat]} border border-transparent`
                        }`}
                      >
                        <p className={`font-black text-xs uppercase ${form.category === cat ? 'text-white' : ''}`}>{cat}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Description</label>
                  <input
                    type="text"
                    required
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="e.g. Cement supply — 250 bags"
                    className="w-full h-14 bg-surface border border-outline-variant/30 rounded-xl px-4 font-medium text-sm outline-none focus:border-primary transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Amount (₹)</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={form.amount}
                      onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0"
                      className="w-full h-14 bg-surface border border-outline-variant/30 rounded-xl px-4 font-black text-xl outline-none focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Date</label>
                    <input
                      type="date"
                      value={form.date}
                      onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full h-14 bg-surface border border-outline-variant/30 rounded-xl px-4 font-bold text-sm outline-none focus:border-primary transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!form.description || !form.amount}
                  className="w-full h-14 machined-gradient text-white font-headline font-black uppercase tracking-widest rounded-xl disabled:opacity-50 active-press shadow-lg shadow-primary/20"
                >
                  Save Expense
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
