"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { requestJson } from "@/lib/http/client";

export type CategoryOption = {
  categoryId: string;
  name: string;
  icon?: string | null;
};

type SimilarityCandidate = {
  id: string;
  name: string;
  score: number;
  band: "high" | "medium";
};

type Props = {
  initialCategories?: CategoryOption[];
  onSelect: (category: CategoryOption) => void;
};

export function CategoryPicker({ initialCategories = [], onSelect }: Props) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 250);
  const [matches, setMatches] = useState<CategoryOption[]>(initialCategories.slice(0, 6));
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!debounced) {
      setMatches(initialCategories.slice(0, 6));
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const res = await requestJson<SimilarityCandidate[]>("/api/forms/categories/similar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: debounced }),
      });
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setMatches(
          res.data.slice(0, 3).map((c) => ({ categoryId: c.id, name: c.name })),
        );
      } else {
        toast.error(res.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, initialCategories]);

  async function handleCreate() {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    const res = await requestJson<CategoryOption>("/api/forms/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setCreating(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success(`Created "${res.data.name}"`);
    onSelect(res.data);
  }

  const exactMatch = matches.find(
    (m) => m.name.trim().toLowerCase() === query.trim().toLowerCase(),
  );

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="category-search" className="font-label-md text-label-md uppercase text-on-surface-variant">
          Category
        </label>
        <div className="relative">
          <span className="material-symbols-outlined pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-on-surface-variant">
            search
          </span>
          <input
            id="category-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or create…"
            aria-label="Search categories"
            className="h-11 w-full rounded border border-outline bg-surface-container-lowest pl-10 pr-4 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <ul className="flex flex-col gap-2" aria-busy={loading}>
        {loading ? (
          <li className="font-body-md text-body-md text-on-surface-variant">Searching…</li>
        ) : null}
        {matches.map((c) => (
          <li key={c.categoryId}>
            <button
              type="button"
              onClick={() => onSelect(c)}
              className="flex w-full items-center justify-between rounded-lg bg-surface-container-low px-4 py-3 text-left hover:bg-surface-container active-press"
            >
              <span className="flex items-center gap-2 font-body-md text-body-md font-medium text-on-surface">
                <span className="material-symbols-outlined text-primary" style={{ fontSize: '20px' }}>
                  {c.icon ?? 'category'}
                </span>
                {c.name}
              </span>
              <span className="flex items-center gap-1 font-label-md text-label-md uppercase text-primary">
                Use
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_forward</span>
              </span>
            </button>
          </li>
        ))}
        {!loading && matches.length === 0 && query && (
          <li className="font-body-md text-body-md text-on-surface-variant">No matches.</li>
        )}
      </ul>

      {query.trim() && !exactMatch ? (
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary bg-primary/5 px-4 py-3 font-label-md text-label-md uppercase text-primary disabled:opacity-60"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
          {creating ? 'Creating…' : `Create "${query.trim()}"`}
        </button>
      ) : null}
    </div>
  );
}
