'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertCircle,
  Clock,
  FileText,
  Layers,
  Loader2,
  MapPin,
  Plus,
  Repeat,
  TrendingUp,
  Trash2,
} from 'lucide-react';

import { requestJson, type ClientResult } from '@/lib/http/client';
import { confirmDialog } from '@/lib/ui/confirm';

type Site = {
  id: number;
  siteId: string;
  name: string;
  location: string;
  status: 'In Progress' | 'Blocked' | 'Completed';
  budget: string | null;
  currentProgress: number | null;
  currentPhase: string | null;
  supervisorId: string;
};

type OperationType = 'labour' | 'material' | 'machinery' | 'expense' | 'incident';

type OperationSummary = Record<OperationType, {
  todayCount: number;
  todaySpend: number | null;
}>;

type SiteDetailPageClientProps = {
  siteId: string;
  initialSite: Site;
  initialSummary: OperationSummary;
  trackedSpend: string;
  role: 'Admin' | 'Supervisor';
};

function getTypeColor(type: OperationType) {
  switch (type) {
    case 'labour':
      return 'text-sky-400 bg-sky-500/10 border-sky-500/20';
    case 'material':
      return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    case 'machinery':
      return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    case 'expense':
      return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    case 'incident':
      return 'text-red-400 bg-red-500/10 border-red-500/20';
  }
}

function formatCurrency(value: number | null) {
  if (value == null) return null;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatBudgetPair(current: string, agreed: string | null) {
  const currentFormatted = formatCurrency(Number(current)) ?? '₹0';
  const agreedFormatted = agreed ? formatCurrency(Number(agreed)) : null;
  return agreedFormatted ? `${currentFormatted} / ${agreedFormatted}` : currentFormatted;
}

const operationMeta: Array<{
  type: OperationType;
  label: string;
  icon: typeof FileText;
}> = [
  { type: 'labour', label: 'Labour', icon: FileText },
  { type: 'material', label: 'Material', icon: Layers },
  { type: 'machinery', label: 'Machinery', icon: Repeat },
  { type: 'expense', label: 'Expense', icon: TrendingUp },
  { type: 'incident', label: 'Incident', icon: AlertCircle },
];

export default function SiteDetailPageClient({
  siteId,
  initialSite,
  initialSummary,
  trackedSpend,
  role,
}: SiteDetailPageClientProps) {
  const router = useRouter();
  const [siteResult] = useState<ClientResult<Site> | null>({ ok: true, data: initialSite });
  const [deletingSite, setDeletingSite] = useState(false);

  const site = siteResult?.ok ? siteResult.data : initialSite;
  const progress = site.currentProgress ?? 0;

  async function handleDeleteSite() {
    if (role !== 'Admin') return;
    const confirmed = await confirmDialog({
      title: 'Archive site?',
      message: `Archive "${site.name}". You can restore from admin tools.`,
      confirmLabel: 'Archive',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;
    setDeletingSite(true);
    const res = await requestJson<null>(`/api/sites/${siteId}`, { method: 'DELETE' });
    setDeletingSite(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success('Site archived');
    router.push('/app/dashboard');
  }

  return (
    <div className="space-y-6 pt-2 pb-20 max-w-4xl mx-auto">
      <section className="card-standard p-6 border-sky-500/10 bg-sky-500/5 relative overflow-hidden">
        <Layers className="absolute -right-6 -bottom-6 w-32 h-32 text-white/5 rotate-12" />
        <div className="relative z-10 space-y-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="space-y-3 min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-sky-500 text-slate-950 text-[9px] font-bold rounded uppercase tracking-widest">
                  Active Site
                </span>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  #{site.siteId.slice(0, 8)}
                </span>
              </div>
              <h2 className="text-3xl font-extrabold text-white uppercase tracking-tight leading-none truncate">
                {site.name}
              </h2>
              <div className="flex items-center gap-1.5 text-slate-400 font-medium italic text-sm">
                <MapPin className="w-4 h-4 text-sky-500" />
                {site.location}
              </div>
            </div>
            <button
              onClick={() => void handleDeleteSite()}
              disabled={role !== 'Admin' || deletingSite}
              title={role === 'Admin' ? 'Archive site' : 'Only admins can delete sites'}
              className="md:self-start p-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-red-500/10 hover:text-red-400 transition-all text-slate-500 shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deletingSite ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-white/5">
            {[
              { label: 'Phase', val: site.currentPhase ?? '—', icon: Layers },
              {
                label: 'Budget',
                val: formatBudgetPair(trackedSpend, site.budget),
                sub: site.budget ? `${Math.round((Number(trackedSpend) / Number(site.budget)) * 100)}% used` : null,
                icon: TrendingUp,
              },
              { label: 'Progress', val: `${progress}%`, icon: Clock, highlight: true },
              { label: 'Status', val: site.status, icon: AlertCircle },
            ].map((stat) => (
              <div key={stat.label} className="space-y-0.5">
                <div className="flex items-center gap-1 text-slate-500">
                  <stat.icon className="w-3.5 h-3.5" />
                  <span className="text-[9px] font-bold uppercase tracking-widest leading-none">{stat.label}</span>
                </div>
                <p className={`text-xl font-extrabold tracking-tight ${stat.highlight ? 'text-sky-400' : 'text-white'}`}>
                  {stat.val}
                </p>
                {'sub' in stat && stat.sub ? (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{stat.sub}</p>
                ) : null}
              </div>
            ))}
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-sky-500 transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href={`/app/logs/new?siteId=${encodeURIComponent(siteId)}`}
          className="btn-primary flex py-4 gap-3 uppercase shadow-sky-500/20"
        >
          <Plus className="w-5 h-5" />
          <span className="flex-1 text-center">New Log Entry</span>
        </Link>
        <Link
          href={`/app/transfers/new?fromSite=${encodeURIComponent(siteId)}`}
          className="btn-secondary flex py-4 gap-3 uppercase border-white/10"
        >
          <Repeat className="w-5 h-5 text-sky-500" />
          <span className="flex-1 text-center">Transfer Resources</span>
        </Link>
      </section>

      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
          Operations Queue <FileText className="w-4 h-4 text-sky-500" />
        </h3>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        {operationMeta.map((operation) => {
          const Icon = operation.icon;
          const summary = initialSummary[operation.type];
          const spend = formatCurrency(summary.todaySpend);
          return (
            <Link
              key={operation.type}
              href={`/app/sites/${siteId}/operations/${operation.type}`}
              className={`card-standard group p-5 border-2 ${getTypeColor(operation.type).split(' ')[2]} hover:bg-white/5 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500/70`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3 min-w-0">
                  <span className={`inline-flex text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg border ${getTypeColor(operation.type)}`}>
                    {operation.label}
                  </span>
                  <div>
                    <p className="text-3xl font-extrabold text-white">{summary.todayCount}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Entries Today</p>
                  </div>
                  {spend ? (
                    <p className="text-sm font-bold text-slate-200">{spend}</p>
                  ) : (
                    <p className="text-sm font-bold text-slate-500">No spend tracked today</p>
                  )}
                  <p className="text-[10px] font-bold uppercase tracking-widest text-sky-400">Click for details</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 group-hover:text-sky-400 transition-colors shrink-0">
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
