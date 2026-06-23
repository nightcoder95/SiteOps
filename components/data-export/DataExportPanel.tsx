'use client';

import { Database, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { TABLE_KEYS } from '@/lib/export/tableRegistry';

// File downloads, NOT SWR: fetch -> blob -> object URL -> anchor click. The
// filename is taken from the server's Content-Disposition when present.
async function download(url: string, fallbackName: string) {
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
  const [busy, setBusy] = useState<string | null>(null);

  const run = (key: string, url: string, name: string) => async () => {
    if (busy) return;
    setBusy(key);
    try {
      await download(url, name);
      toast.success('Download started');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(null);
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
              Re-importable shape. Contains all data including user contact info — keep it safe.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={run('__full__', '/api/admin/export', `siteops-backup-${today()}.json`)}
          disabled={busy !== null}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-sky-500/20 bg-gradient-to-r from-sky-500/15 to-indigo-500/15 px-4 py-2.5 text-sm font-bold text-sky-300 transition-all hover:from-sky-500/25 hover:to-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === '__full__' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download full backup (JSON)
        </button>
      </section>

      {/* Per-table CSV */}
      <section className="rounded-2xl border border-white/[0.06] bg-slate-950/40 p-5 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-white">Single-table CSV</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Export one table for spreadsheet analysis.
            </p>
          </div>
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TABLE_KEYS.map((key) => (
            <li key={key}>
              <button
                type="button"
                onClick={run(
                  key,
                  `/api/admin/export/${key}`,
                  `siteops-${key}-${today()}.csv`,
                )}
                disabled={busy !== null}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left text-sm text-slate-300 transition-all hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="truncate font-mono text-xs">{key}</span>
                {busy === key ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
                ) : (
                  <Download className="h-4 w-4 shrink-0 text-slate-500" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
