import React from 'react';
import { ChevronLeft, Users, Package, Truck, Wallet, ChevronRight, ArrowRight } from 'lucide-react';
import { Site, View, LabourEntry, MaterialEntry, MachineryEntry, ExpenseEntry } from '@/lib/types/legacy';

interface WorksiteDashboardViewProps {
  site: Site | null;
  labourEntries: LabourEntry[];
  materialEntries: MaterialEntry[];
  machineryEntries: MachineryEntry[];
  expenseEntries: ExpenseEntry[];
  goBack: () => void;
  navigate: (view: View) => void;
}

export function WorksiteDashboardView({
  site,
  labourEntries,
  materialEntries,
  machineryEntries,
  expenseEntries,
  goBack,
  navigate,
}: WorksiteDashboardViewProps) {
  if (!site) return null;

  const today = new Date().toISOString().split('T')[0];

  const todayLabour = labourEntries.filter(e => e.siteId === site.id && e.date === today);
  const todayMaterials = materialEntries.filter(e => e.siteId === site.id && e.date === today);
  const todayMachinery = machineryEntries.filter(e => e.siteId === site.id && e.date === today);
  const siteExpenses = expenseEntries.filter(e => e.siteId === site.id);

  const totalWorkers = todayLabour.reduce((s, e) => s + e.peopleCount, 0);
  const totalExpense = siteExpenses.reduce((s, e) => s + e.amount, 0);

  const categories = [
    {
      id: 'labour',
      label: 'Labour',
      icon: Users,
      view: 'LABOUR_ENTRY' as View,
      stat: totalWorkers > 0 ? `${totalWorkers} workers today` : `${todayLabour.length} entries today`,
      accent: 'bg-blue-50 text-blue-600',
      iconBg: 'bg-blue-100',
    },
    {
      id: 'materials',
      label: 'Materials',
      icon: Package,
      view: 'MATERIALS_ENTRY' as View,
      stat: todayMaterials.length > 0 ? `${todayMaterials.length} deliveries today` : 'No entries today',
      accent: 'bg-green-50 text-green-600',
      iconBg: 'bg-green-100',
    },
    {
      id: 'machinery',
      label: 'Machinery & Equipment',
      icon: Truck,
      view: 'MACHINERY_ENTRY' as View,
      stat: todayMachinery.length > 0 ? `${todayMachinery.reduce((s, e) => s + e.count, 0)} units active` : 'No entries today',
      accent: 'bg-purple-50 text-purple-600',
      iconBg: 'bg-purple-100',
    },
    {
      id: 'expense',
      label: 'Expenses',
      icon: Wallet,
      view: 'EXPENSE_ENTRY' as View,
      stat: `₹${(totalExpense / 1000).toFixed(0)}K total`,
      accent: 'bg-orange-50 text-orange-600',
      iconBg: 'bg-orange-100',
    },
  ];

  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden">
      <header className="p-4 flex items-center gap-4 bg-white border-b border-outline-variant/30 sticky top-0 z-10">
        <button
          onClick={goBack}
          className="w-10 h-10 bg-on-surface text-surface rounded-xl flex items-center justify-center active-press shadow-lg shadow-on-surface/20"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-60">{site.location}</p>
          <h2 className="font-headline font-black uppercase text-sm tracking-tight text-on-surface truncate">{site.name}</h2>
        </div>
        <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tight ${
          site.status === 'In Progress' ? 'bg-primary/10 text-primary' :
          site.status === 'Blocked' ? 'bg-error/10 text-error' : 'bg-green-100 text-green-600'
        }`}>
          {site.status}
        </div>
      </header>

      <main className="flex-grow overflow-y-auto no-scrollbar pb-28">
        {/* Site Hero */}
        <div className="p-6 bg-white border-b border-outline-variant/10">
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-60 mb-1">Current Phase</p>
              <p className="font-headline font-black text-lg uppercase leading-none text-on-surface">{site.phase}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-60 mb-1">Supervisor</p>
              <p className="text-xs font-bold uppercase">{site.supervisor}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-60">Progress</span>
              <span className="text-[9px] font-black text-primary">{site.progress}%</span>
            </div>
            <div className="h-2 bg-surface-container rounded-full overflow-hidden">
              <div
                className="h-full machined-gradient rounded-full transition-all duration-700"
                style={{ width: `${site.progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* 4 Category Cards */}
        <div className="p-5 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant px-1">Site Categories</p>

          {categories.map(cat => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => navigate(cat.view)}
                className="w-full bg-white p-5 rounded-2xl border border-outline-variant/20 shadow-sm flex items-center gap-4 active-press group hover:border-primary/30 transition-all"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${cat.iconBg}`}>
                  <Icon className={`w-6 h-6 ${cat.accent.split(' ')[1]}`} />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="font-headline font-black text-sm uppercase tracking-tight text-on-surface">{cat.label}</p>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest opacity-70 mt-0.5">{cat.stat}</p>
                </div>
                <div className="p-2 rounded-xl border border-outline-variant/20 group-hover:border-primary/30 group-hover:bg-primary/5 transition-all">
                  <ChevronRight className="w-4 h-4 text-on-surface-variant group-hover:text-primary transition-colors" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="px-5 pb-5 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant px-1">Quick Actions</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('RESOURCE_REQUEST')}
              className="bg-white p-4 rounded-2xl border border-outline-variant/20 text-left active-press group hover:border-primary/30 transition-all"
            >
              <ArrowRight className="w-5 h-5 text-primary mb-2" />
              <p className="text-xs font-black uppercase leading-none">Raise Request</p>
              <p className="text-[9px] font-bold text-on-surface-variant uppercase mt-1 opacity-60">Labor / Material</p>
            </button>
            <button
              onClick={() => navigate('INCIDENT_REPORT')}
              className="bg-white p-4 rounded-2xl border border-outline-variant/20 text-left active-press group hover:border-error/30 transition-all"
            >
              <ArrowRight className="w-5 h-5 text-error mb-2" />
              <p className="text-xs font-black uppercase leading-none text-error">Report Incident</p>
              <p className="text-[9px] font-bold text-on-surface-variant uppercase mt-1 opacity-60">Safety / Blocks</p>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
