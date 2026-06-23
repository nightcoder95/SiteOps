'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { notifyError } from '@/lib/ui/toast';
import {
  AlertCircle,
  Clock,
  Edit3,
  FileText,
  Layers,
  Loader2,
  MapPin,
  Plus,
  Repeat,
  TrendingUp,
  Trash2,
} from 'lucide-react';

import { can } from '@/lib/auth/capabilities';
import { requestJson, type ClientResult } from '@/lib/http/client';
import { confirmDialog } from '@/lib/ui/confirm';
import { EditSiteModal } from './EditSiteModal';
import { EntryTypeIcon } from '@/components/constants/EntryTypeIcon';

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
  totalCount: number;
  totalSpend: number | null;
}>;

type Supervisor = { userId: string; displayName: string };

type SiteDetailPageClientProps = {
  siteId: string;
  initialSite: Site;
  initialSummary: OperationSummary;
  trackedSpend: string;
  role: 'Admin' | 'Supervisor';
  supervisors: Supervisor[];
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

// Compact Indian-format currency for the all-time row (e.g. ₹2.1L, ₹3.4Cr).
function formatCompactCurrency(value: number | null) {
  if (value == null) return null;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
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
}> = [
  { type: 'labour', label: 'Labour' },
  { type: 'material', label: 'Material' },
  { type: 'machinery', label: 'Machinery' },
  { type: 'expense', label: 'Expense' },
  { type: 'incident', label: 'Incident' },
];

export default function SiteDetailPageClient({
  siteId,
  initialSite,
  initialSummary,
  trackedSpend,
  role,
  supervisors,
}: SiteDetailPageClientProps) {
  const router = useRouter();
  const [siteResult] = useState<ClientResult<Site> | null>({ ok: true, data: initialSite });
  const [deletingSite, setDeletingSite] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const site = siteResult?.ok ? siteResult.data : initialSite;
  const progress = site.currentProgress ?? 0;
  const canDeleteSite = can(role, 'site:delete');
  const canEditSite = can(role, 'site:update');

  async function handleDeleteSite() {
    if (!canDeleteSite) return;
    const confirmed = await confirmDialog({
      title: 'Archive site?',
      message: `Archive "${site.name}". It moves to Archived Sites on Home (restorable), and the name becomes available for reuse.`,
      confirmLabel: 'Archive',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;
    setDeletingSite(true);
    const res = await requestJson<null>(`/api/sites/${siteId}`, { method: 'DELETE' });
    setDeletingSite(false);
    if (!res.ok) {
      notifyError(res);
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
            {(canEditSite || canDeleteSite) ? (
              <div className="flex items-center gap-2 md:self-start">
                {canEditSite ? (
                  <button
                    onClick={() => setEditOpen(true)}
                    aria-label="Edit site"
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-300 transition-all hover:border-sky-500/40 hover:text-sky-400"
                  >
                    <Edit3 className="w-4 h-4" /> Edit
                  </button>
                ) : null}
                {canDeleteSite ? (
                  <button
                    onClick={() => void handleDeleteSite()}
                    disabled={deletingSite}
                    title="Archive site"
                    aria-label="Archive site"
                    className="inline-flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold uppercase tracking-widest text-red-400 transition-all hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingSite ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Archive
                  </button>
                ) : null}
              </div>
            ) : null}
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
          const summary = initialSummary[operation.type];
          const todaySpend = formatCurrency(summary.todaySpend);
          const totalSpend = formatCompactCurrency(summary.totalSpend);
          const totalLabel = summary.totalCount === 1 ? 'entry' : 'entries';
          return (
            <Link
              key={operation.type}
              href={`/app/sites/${siteId}/operations/${operation.type}`}
              className={`card-standard group p-5 border-2 ${getTypeColor(operation.type).split(' ')[2]} hover:bg-white/5 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500/70`}
            >
              {/* Header: badge + icon */}
              <div className="flex items-start justify-between gap-3">
                <span className={`inline-flex text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg border ${getTypeColor(operation.type)}`}>
                  {operation.label}
                </span>
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 group-hover:text-sky-400 transition-colors shrink-0">
                  <EntryTypeIcon type={operation.type} className="w-6 h-6" />
                </div>
              </div>

              {/* Today: primary stat */}
              <div className="mt-4 flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-3xl font-extrabold text-white leading-none">{summary.todayCount}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Today</p>
                </div>
                {todaySpend ? (
                  <p className="text-sm font-bold text-slate-200 shrink-0">{todaySpend}</p>
                ) : null}
              </div>

              {/* Divider */}
              <div className="my-3 border-t border-white/10" />

              {/* All-time: secondary stat */}
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-400 truncate">
                  {summary.totalCount.toLocaleString('en-IN')} {totalLabel} all-time
                </span>
                {totalSpend ? (
                  <span className="font-bold text-slate-300 shrink-0">{totalSpend}</span>
                ) : null}
              </div>
            </Link>
          );
        })}
      </section>

      {canEditSite ? (
        <EditSiteModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          site={site}
          supervisors={supervisors}
        />
      ) : null}
    </div>
  );
}
