import React, { useState } from 'react';
import { ChevronLeft, Wallet, TrendingUp, BarChart3, List } from 'lucide-react';
import { motion } from 'motion/react';
import { Site, View, ExpenseEntry, ExpenseCategory, EXPENSE_CATEGORIES } from '../../types';

interface ExpenseManagerViewProps {
  expenses: ExpenseEntry[];
  sites: Site[];
  goBack: () => void;
  navigate: (view: View) => void;
}

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  Labour:    'bg-blue-500',
  Materials: 'bg-green-500',
  Equipment: 'bg-purple-500',
  Misc:      'bg-slate-400',
};

const CATEGORY_BG: Record<ExpenseCategory, string> = {
  Labour:    'bg-blue-50 text-blue-700',
  Materials: 'bg-green-50 text-green-700',
  Equipment: 'bg-purple-50 text-purple-700',
  Misc:      'bg-slate-50 text-slate-600',
};

type Tab = 'overview' | 'ledger';

export function ExpenseManagerView({ expenses, sites, goBack }: ExpenseManagerViewProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [filterSite, setFilterSite] = useState<string>('all');
  const [filterCat, setFilterCat] = useState<ExpenseCategory | 'All'>('All');

  const totalSpend = expenses.reduce((s, e) => s + e.amount, 0);
  const avgPerSite = totalSpend / sites.length;

  const spendBySite = sites.map(site => ({
    site,
    total: expenses.filter(e => e.siteId === site.id).reduce((s, e) => s + e.amount, 0),
  })).sort((a, b) => b.total - a.total);

  const maxSiteSpend = Math.max(...spendBySite.map(s => s.total), 1);

  const spendByCategory = EXPENSE_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
    return acc;
  }, {} as Record<ExpenseCategory, number>);

  const thisMonth = expenses.filter(e => {
    const d = new Date(e.date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const thisMonthTotal = thisMonth.reduce((s, e) => s + e.amount, 0);

  const filtered = expenses
    .filter(e => filterSite === 'all' || e.siteId === filterSite)
    .filter(e => filterCat === 'All' || e.category === filterCat)
    .sort((a, b) => b.date.localeCompare(a.date));

  const fmt = (n: number) => {
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
    return `₹${n}`;
  };

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
          <p className="text-[9px] font-black uppercase tracking-widest text-primary opacity-80">Centralised</p>
          <h2 className="font-headline font-black uppercase text-sm tracking-tight text-on-surface">Expense Manager</h2>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex bg-white px-5 border-b border-outline-variant/10">
        {([['overview', 'Overview', BarChart3], ['ledger', 'Ledger', List]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-3.5 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${
              tab === id ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="flex-grow overflow-y-auto no-scrollbar pb-28">
          {/* KPI Cards */}
          <div className="p-5 grid grid-cols-2 gap-3">
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-5 border border-outline-variant/20 shadow-sm col-span-2"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 machined-gradient rounded-xl flex items-center justify-center">
                  <Wallet className="w-4 h-4 text-white" />
                </div>
                <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-60">Total Spend — All Sites</p>
              </div>
              <p className="font-headline font-black text-4xl text-on-surface">{fmt(totalSpend)}</p>
              <p className="text-[10px] text-on-surface-variant mt-1 font-bold uppercase tracking-widest opacity-60">{expenses.length} transactions</p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="bg-white rounded-2xl p-4 border border-outline-variant/20 shadow-sm"
            >
              <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-60 mb-1">This Month</p>
              <p className="font-headline font-black text-xl text-on-surface">{fmt(thisMonthTotal)}</p>
              <p className="text-[9px] text-on-surface-variant font-bold mt-1 opacity-50">{thisMonth.length} entries</p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
              className="bg-white rounded-2xl p-4 border border-outline-variant/20 shadow-sm"
            >
              <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-60 mb-1">Avg / Site</p>
              <p className="font-headline font-black text-xl text-on-surface">{fmt(avgPerSite)}</p>
              <p className="text-[9px] text-on-surface-variant font-bold mt-1 opacity-50">{sites.length} sites</p>
            </motion.div>
          </div>

          {/* Per-Site Spend Bars */}
          <div className="px-5 pb-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant mb-3">Spend by Worksite</p>
            <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-5 space-y-4">
              {spendBySite.map(({ site, total }, i) => {
                const pct = (total / maxSiteSpend) * 100;
                const budgetPct = Math.min(100, (total / site.budget) * 100);
                return (
                  <motion.div
                    key={site.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07 }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div>
                        <p className="text-xs font-black uppercase tracking-tight">{site.name}</p>
                        <p className="text-[8px] text-on-surface-variant font-bold uppercase opacity-60">{site.location}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black">{fmt(total)}</p>
                        <p className={`text-[8px] font-bold uppercase ${budgetPct > 80 ? 'text-error' : 'text-on-surface-variant opacity-60'}`}>
                          {budgetPct.toFixed(0)}% of budget
                        </p>
                      </div>
                    </div>
                    <div className="h-2 bg-surface-container rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, delay: i * 0.07 + 0.2, ease: 'easeOut' }}
                        className="h-full machined-gradient rounded-full"
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="px-5 pb-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant mb-3">Spend by Category</p>
            <div className="bg-white rounded-2xl border border-outline-variant/20 shadow-sm p-5">
              {/* Stacked Bar */}
              <div className="h-4 rounded-full overflow-hidden flex mb-4">
                {EXPENSE_CATEGORIES.map(cat => {
                  const pct = totalSpend > 0 ? (spendByCategory[cat] / totalSpend) * 100 : 0;
                  return pct > 0 ? (
                    <div
                      key={cat}
                      className={`h-full ${CATEGORY_COLORS[cat]} transition-all`}
                      style={{ width: `${pct}%` }}
                      title={`${cat}: ${pct.toFixed(1)}%`}
                    />
                  ) : null;
                })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {EXPENSE_CATEGORIES.map(cat => {
                  const amt = spendByCategory[cat];
                  const pct = totalSpend > 0 ? (amt / totalSpend) * 100 : 0;
                  return (
                    <div key={cat} className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${CATEGORY_COLORS[cat]}`} />
                      <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">{cat}</p>
                        <p className="font-black text-sm text-on-surface">{fmt(amt)}</p>
                        <p className="text-[8px] text-on-surface-variant opacity-50">{pct.toFixed(1)}%</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Top 5 Expenses */}
          <div className="px-5 pb-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant mb-3">Largest Expenses</p>
            <div className="space-y-2">
              {[...expenses].sort((a, b) => b.amount - a.amount).slice(0, 5).map((exp, i) => {
                const site = sites.find(s => s.id === exp.siteId);
                return (
                  <motion.div
                    key={exp.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white rounded-2xl border border-outline-variant/20 p-4 shadow-sm flex items-start gap-3"
                  >
                    <div className="w-7 h-7 bg-surface rounded-lg flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-black text-on-surface-variant">#{i + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm leading-snug truncate">{exp.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${CATEGORY_BG[exp.category]}`}>{exp.category}</span>
                        <span className="text-[9px] text-on-surface-variant font-bold opacity-60">{site?.name}</span>
                      </div>
                    </div>
                    <p className="font-headline font-black text-sm shrink-0">{fmt(exp.amount)}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'ledger' && (
        <div className="flex-grow flex flex-col overflow-hidden">
          {/* Filters */}
          <div className="bg-white border-b border-outline-variant/10 p-3 space-y-2 shrink-0">
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setFilterSite('all')}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide whitespace-nowrap active-press transition-all ${
                  filterSite === 'all' ? 'machined-gradient text-white' : 'bg-surface text-on-surface-variant border border-outline-variant/30'
                }`}
              >
                All Sites
              </button>
              {sites.map(s => (
                <button
                  key={s.id}
                  onClick={() => setFilterSite(s.id)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide whitespace-nowrap active-press transition-all ${
                    filterSite === s.id ? 'machined-gradient text-white' : 'bg-surface text-on-surface-variant border border-outline-variant/30'
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {(['All', ...EXPENSE_CATEGORIES] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCat(cat)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide whitespace-nowrap active-press transition-all ${
                    filterCat === cat ? 'bg-on-surface text-surface' : 'bg-surface text-on-surface-variant border border-outline-variant/30'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Summary row */}
          <div className="px-5 py-3 bg-surface-container flex items-center justify-between border-b border-outline-variant/10 shrink-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
              {filtered.length} entries
            </p>
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">
              {fmt(filtered.reduce((s, e) => s + e.amount, 0))}
            </p>
          </div>

          <div className="flex-grow overflow-y-auto no-scrollbar pb-28 p-5 space-y-2">
            {filtered.map((expense, i) => {
              const site = sites.find(s => s.id === expense.siteId);
              return (
                <motion.div
                  key={expense.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  className="bg-white rounded-2xl border border-outline-variant/20 p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${CATEGORY_COLORS[expense.category]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-sm text-on-surface leading-snug">{expense.description}</p>
                        <p className="font-headline font-black text-sm text-on-surface shrink-0">{fmt(expense.amount)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${CATEGORY_BG[expense.category]}`}>
                          {expense.category}
                        </span>
                        <span className="text-[9px] text-primary font-bold uppercase tracking-widest">{site?.name}</span>
                        <span className="text-[9px] text-on-surface-variant font-bold opacity-60">
                          {new Date(expense.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </span>
                        <span className="text-[9px] text-on-surface-variant opacity-50">· {expense.enteredBy}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {filtered.length === 0 && (
              <div className="py-16 text-center space-y-3">
                <TrendingUp className="w-12 h-12 text-on-surface-variant/20 mx-auto" />
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-40">No expenses match filters</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
