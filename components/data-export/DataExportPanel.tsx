'use client';

import { Check, ChevronDown, Database, Download, FileSpreadsheet, Loader2, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { TABLE_KEYS } from '@/lib/export/tableRegistry';

// snake_case table key -> "Title Case" label for humans.
function friendly(key: string): string {
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function downloadOne(url: string, fallbackName: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const name =
    res.headers.get('content-disposition')?.match(/filename="(.+?)"/)?.[1] ?? fallbackName;
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
  URL.revokeObjectURL(href);
}

const today = () => new Date().toISOString().slice(0, 10);

export function DataExportPanel() {
  const [fullBusy, setFullBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [csvBusy, setCsvBusy] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close the picker on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = TABLE_KEYS.filter(
    (k) => k.includes(query.toLowerCase()) || friendly(k).toLowerCase().includes(query.toLowerCase()),
  );

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allFilteredSelected = filtered.length > 0 && filtered.every((k) => selected.has(k));
  const toggleAllFiltered = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((k) => next.delete(k));
      else filtered.forEach((k) => next.add(k));
      return next;
    });

  const exportFull = async () => {
    if (fullBusy) return;
    setFullBusy(true);
    try {
      await downloadOne('/api/admin/export', `siteops-backup-${today()}.json`);
      toast.success('Backup download started');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setFullBusy(false);
    }
  };

  const exportSelected = async () => {
    if (csvBusy || selected.size === 0) return;
    setCsvBusy(true);
    const keys = TABLE_KEYS.filter((k) => selected.has(k)); // keep registry order
    let done = 0;
    try {
      for (const key of keys) {
        // Sequential so the browser doesn't block a burst of downloads.
        await downloadOne(`/api/admin/export/${key}`, `siteops-${key}-${today()}.csv`);
        done += 1;
        if (keys.length > 1) await new Promise((r) => setTimeout(r, 250));
      }
      toast.success(`Exported ${done} ${done === 1 ? 'table' : 'tables'}`);
    } catch (e) {
      toast.error(
        `${e instanceof Error ? e.message : 'Export failed'}${done ? ` (${done} of ${keys.length} done)` : ''}`,
      );
    } finally {
      setCsvBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Full JSON backup */}
      <section className="rounded-2xl border border-white/[0.06] bg-slate-950/40 p-5 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <Database className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-white">Full backup (JSON)</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              A consistent snapshot of all {TABLE_KEYS.length} tables, money preserved exactly.
              Contains all data including user contact info — keep it safe.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={exportFull}
          disabled={fullBusy}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-sky-500/20 bg-gradient-to-r from-sky-500/15 to-indigo-500/15 px-4 py-2.5 text-sm font-bold text-sky-300 transition-colors hover:from-sky-500/25 hover:to-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {fullBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download full backup (JSON)
        </button>
      </section>

      {/* Per-table CSV — pick one or many, then export */}
      <section className="rounded-2xl border border-white/[0.06] bg-slate-950/40 p-5 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-white">Table CSV export</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Pick one or more tables, then export. Each downloads as a spreadsheet-ready CSV.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Multi-select picker */}
          <div ref={pickerRef} className="relative w-full sm:max-w-xs">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={open}
              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-left text-sm text-slate-200 transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/50"
            >
              <span className={selected.size ? 'text-slate-100' : 'text-slate-400'}>
                {selected.size ? `${selected.size} table${selected.size === 1 ? '' : 's'} selected` : 'Select tables…'}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              />
            </button>

            {open && (
              <div
                role="listbox"
                aria-label="Tables to export"
                className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/[0.08] bg-slate-900/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
              >
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
                  <Search className="h-4 w-4 shrink-0 text-slate-500" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search tables"
                    className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="Clear search"
                      className="cursor-pointer text-slate-500 hover:text-slate-300"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={toggleAllFiltered}
                  disabled={filtered.length === 0}
                  className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-400 hover:bg-white/[0.04] disabled:opacity-40"
                >
                  {allFilteredSelected ? 'Clear all' : 'Select all'}
                  <span className="text-slate-500">{filtered.length}</span>
                </button>

                <ul className="max-h-64 overflow-y-auto py-1">
                  {filtered.length === 0 && (
                    <li className="px-3 py-3 text-center text-sm text-slate-500">No match</li>
                  )}
                  {filtered.map((key) => {
                    const on = selected.has(key);
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={on}
                          onClick={() => toggle(key)}
                          className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/[0.05]"
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                              on
                                ? 'border-emerald-500 bg-emerald-500/90 text-slate-950'
                                : 'border-white/20 bg-transparent'
                            }`}
                          >
                            {on && <Check className="h-3 w-3" strokeWidth={3} />}
                          </span>
                          <span className="flex-1 truncate">{friendly(key)}</span>
                          <span className="truncate font-mono text-[10px] text-slate-600">{key}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Export action */}
          <button
            type="button"
            onClick={exportSelected}
            disabled={csvBusy || selected.size === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/15 to-teal-500/15 px-4 py-2.5 text-sm font-bold text-emerald-300 transition-colors hover:from-emerald-500/25 hover:to-teal-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {csvBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {csvBusy ? 'Exporting…' : `Export${selected.size ? ` (${selected.size})` : ''}`}
          </button>

          {selected.size > 0 && !csvBusy && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="cursor-pointer self-center text-sm text-slate-500 hover:text-slate-300"
            >
              Clear
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
