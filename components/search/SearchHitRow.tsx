'use client';

import { EntryTypeIcon } from '@/components/constants/EntryTypeIcon';
import { formatCurrency } from '@/components/operations/entryFormat';
import { splitHighlight } from '@/lib/search/highlight';
import type { SearchHit, SearchSource } from '@/lib/db/queries/search';

const SOURCE_LABEL: Record<SearchSource, string> = {
  labour: 'Labour',
  material: 'Material',
  machinery: 'Machinery',
  expense: 'Expense',
};

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

type Props = {
  hit: SearchHit;
  query: string;
  active?: boolean;
  optionId?: string;
  onSelect: (hit: SearchHit) => void;
};

export function SearchHitRow({ hit, query, active = false, optionId, onSelect }: Props) {
  const parts = splitHighlight(hit.snippet, query);

  return (
    <button
      type="button"
      id={optionId}
      role="option"
      aria-selected={active}
      onClick={() => onSelect(hit)}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-2xl transition-colors ${
        active ? 'bg-sky-500/10' : 'hover:bg-white/5'
      }`}
    >
      <span className="mt-0.5 w-8 h-8 shrink-0 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
        <EntryTypeIcon type={hit.source} className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-slate-200 line-clamp-2 break-words">
          {parts.map((part, i) =>
            part.match ? (
              <mark key={i} className="bg-transparent text-sky-300 font-semibold">
                {part.text}
              </mark>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </span>
        <span className="mt-1 block text-[11px] uppercase tracking-wider text-slate-500 truncate">
          {hit.siteName} · {SOURCE_LABEL[hit.source]} · {formatShortDate(hit.date)}
        </span>
      </span>
      {hit.amount != null && (
        <span className="mt-0.5 shrink-0 text-xs font-bold text-sky-400 tabular-nums">
          {formatCurrency(hit.amount)}
        </span>
      )}
    </button>
  );
}
