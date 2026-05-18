'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin,
  Plus,
  Repeat,
  Trash2,
  Filter,
  FileText,
  ChevronRight,
  Clock,
  TrendingUp,
  AlertCircle,
  Loader2,
  Layers,
} from 'lucide-react';

import { ApiUnavailableBanner } from '@/components/ui/page-primitives';
import { requestJson, type ClientResult } from '@/lib/http/client';

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

type EntryType = 'labour' | 'material' | 'machinery' | 'expense' | 'incident' | 'all';
type EditableEntryType = Exclude<EntryType, 'all'>;
type Entry = Record<string, any> & { id: string };
type SiteEntriesResponse =
  | Entry[]
  | {
      labour: Entry[];
      material: Entry[];
      machinery: Entry[];
      expense: Entry[];
      incident: Entry[];
    };

type SiteDetailPageClientProps = {
  siteId: string;
  initialSite: Site;
  initialEntries: SiteEntriesResponse;
  role: 'Admin' | 'Supervisor';
};

function formatDate(value?: string) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function summarizeEntry(entry: Entry, type: EditableEntryType) {
  if (type === 'labour') return `${entry.workType ?? 'Labour'} • ${entry.peopleCount ?? 0} people`;
  if (type === 'material') return `${entry.materialType ?? 'Material'} • ${entry.quantity ?? 0} ${entry.unit ?? ''}`.trim();
  if (type === 'machinery') return `${entry.equipmentType ?? 'Machinery'} • ${entry.count ?? 0} units`;
  if (type === 'expense') return `${entry.description ?? 'Expense'} • ₹${entry.amount ?? 0}`;
  if (type === 'incident') return `${entry.incidentType ?? 'Incident'} • ${entry.severity ?? 'Low'}`;
  return entry.id;
}

function entryRowId(entry: Entry, type: EditableEntryType): string {
  switch (type) {
    case 'labour':
      return entry.labourEntryId ?? entry.id;
    case 'material':
      return entry.materialEntryId ?? entry.id;
    case 'machinery':
      return entry.machineryEntryId ?? entry.id;
    case 'expense':
      return entry.expenseEntryId ?? entry.id;
    case 'incident':
      return entry.incidentReportId ?? entry.id;
  }
}

function getTypeColor(type: string) {
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
    default:
      return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
  }
}

function statusBadge(status: Site['status']) {
  switch (status) {
    case 'Blocked':
      return 'badge-amber';
    case 'Completed':
      return 'badge-sky';
    default:
      return 'badge-emerald';
  }
}

export default function SiteDetailPageClient({
  siteId,
  initialSite,
  initialEntries,
  role,
}: SiteDetailPageClientProps) {
  const router = useRouter();
  const [siteResult] = useState<ClientResult<Site> | null>({ ok: true, data: initialSite });
  const [entriesResult, setEntriesResult] = useState<ClientResult<SiteEntriesResponse> | null>({
    ok: true,
    data: initialEntries,
  });
  const [type, setType] = useState<EntryType>('all');
  const [loading, setLoading] = useState(false);
  const [deletingSite, setDeletingSite] = useState(false);

  async function onChangeType(next: EntryType) {
    setType(next);
    setEntriesResult(null);
    setLoading(true);
    const res = await requestJson<SiteEntriesResponse>(
      `/api/sites/${siteId}/entries?type=${encodeURIComponent(next)}`,
    );
    setEntriesResult(res);
    setLoading(false);
  }

  const site = siteResult?.ok ? siteResult.data : initialSite;
  const progress = site.currentProgress ?? 0;

  async function handleDeleteSite() {
    if (role !== 'Admin') return;
    const confirmed = window.confirm(`Archive site "${site.name}"?`);
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
      {/* Site Header Card */}
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

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-white/5">
            {[
              { label: 'Phase', val: site.currentPhase ?? '—', icon: Layers },
              { label: 'Budget', val: site.budget ? `₹${Number(site.budget).toLocaleString('en-IN')}` : '—', icon: TrendingUp },
              { label: 'Progress', val: `${progress}%`, icon: Clock, highlight: true },
              { label: 'Status', val: site.status, icon: AlertCircle },
            ].map((s) => (
              <div key={s.label} className="space-y-0.5">
                <div className="flex items-center gap-1 text-slate-500">
                  <s.icon className="w-3.5 h-3.5" />
                  <span className="text-[9px] font-bold uppercase tracking-widest leading-none">{s.label}</span>
                </div>
                <p className={`text-xl font-extrabold tracking-tight ${s.highlight ? 'text-sky-400' : 'text-white'}`}>
                  {s.val}
                </p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-sky-500 transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </section>

      {/* Main Actions */}
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

      {/* API Error Banners */}
      {entriesResult && !entriesResult.ok && (entriesResult as any).kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner
          endpoint={(entriesResult as any).endpoint}
          method={(entriesResult as any).method}
        />
      ) : null}

      {entriesResult && !entriesResult.ok && (entriesResult as any).kind !== 'endpoint_unavailable' ? (
        <div className="card-standard p-4 border-red-500/20 bg-red-500/5 text-red-400 text-sm font-medium">
          {(entriesResult as any).message}
        </div>
      ) : null}

      {/* Entry Filter Chips */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
          Operations Queue <FileText className="w-4 h-4 text-sky-500" />
        </h3>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-none">
          {(['all', 'labour', 'material', 'machinery', 'expense', 'incident'] as EntryType[]).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => onChangeType(filter)}
              className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap border ${
                type === filter
                  ? 'bg-sky-500 text-slate-950 border-sky-500 shadow-lg shadow-sky-500/20'
                  : 'bg-white/5 text-slate-500 border-white/5 hover:border-white/10'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Entries List */}
      <section className="space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
          </div>
        )}

        {!loading && entriesResult?.ok && (
          <>
            {type === 'all' ? (
              // Grouped view
              <div className="grid gap-4 md:grid-cols-2">
                {(['labour', 'material', 'machinery', 'expense', 'incident'] as EditableEntryType[]).map((group) => {
                  const list = (entriesResult.data as Record<string, Entry[]>)[group] ?? [];
                  return (
                    <div key={group} className={`card-standard p-4 border-2 ${getTypeColor(group).split(' ')[2]}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg border ${getTypeColor(group)}`}>
                            {group}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          {list.length} entries
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {list.length === 0 ? (
                          <p className="text-xs text-slate-600 italic">No entries.</p>
                        ) : (
                          list.slice(0, 3).map((entry) => {
                            const id = entryRowId(entry, group);
                            return (
                              <Link
                                key={id}
                                href={`/app/logs/${id}?type=${group}`}
                                className="flex items-center justify-between p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors group"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-slate-200 group-hover:text-sky-400 transition-colors truncate">
                                    {summarizeEntry(entry, group)}
                                  </div>
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    {formatDate(entry.date ?? entry.createdAt ?? entry.timestamp)}
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-sky-400 shrink-0 transition-colors" />
                              </Link>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Single type list view
              <AnimatePresence initial={false} mode="popLayout">
                {Array.isArray(entriesResult.data) && entriesResult.data.length > 0 ? (
                  (entriesResult.data as Entry[]).map((entry, i) => {
                    const editableType = type as EditableEntryType;
                    const id = entryRowId(entry, editableType);
                    return (
                      <motion.div
                        key={id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <Link
                          href={`/app/logs/${id}?type=${editableType}`}
                          className="card-standard group flex items-center justify-between p-5 hover:bg-white/5 transition-all border-white/5"
                        >
                          <div className="flex items-center gap-5 min-w-0">
                            <div className={`w-14 h-14 shrink-0 border-2 rounded-2xl flex items-center justify-center shadow-lg ${getTypeColor(editableType)}`}>
                              <FileText className="w-7 h-7" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-3 mb-1">
                                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg border shadow-sm ${getTypeColor(editableType)}`}>
                                  {editableType}
                                </span>
                                <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1 uppercase tracking-tighter">
                                  <Clock className="w-3.5 h-3.5" />
                                  {formatDate(entry.date ?? entry.createdAt ?? entry.timestamp)}
                                </span>
                              </div>
                              <h4 className="font-bold text-slate-200 group-hover:text-sky-400 transition-colors uppercase tracking-tight text-sm">
                                {summarizeEntry(entry, editableType)}
                              </h4>
                            </div>
                          </div>
                          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-600 group-hover:bg-sky-500 group-hover:text-slate-950 transition-all shrink-0">
                            <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })
                ) : (
                  <div className="text-center py-24 bg-white/2 rounded-3xl border border-dashed border-white/5 backdrop-blur-sm">
                    <Filter className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest italic">
                      No matching operations detected.
                    </p>
                  </div>
                )}
              </AnimatePresence>
            )}
          </>
        )}
      </section>
    </div>
  );
}
