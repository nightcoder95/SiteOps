"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { requestJson } from "@/lib/http/client";

export type SubcategoryOption = {
  subcategoryId: string;
  name: string;
  categoryId: string;
};

type SimilarityCandidate = {
  id: string;
  name: string;
  score: number;
  band: "high" | "medium";
};

type Props = {
  label: string;
  parentCategoryId: string;
  value: SubcategoryOption | null;
  onChange: (value: SubcategoryOption | null) => void;
  required?: boolean;
};

export function SubcategoryCombobox({
  label, parentCategoryId, value, onChange, required,
}: Props) {
  const [query, setQuery] = useState(value?.name ?? "");
  const debounced = useDebouncedValue(query.trim(), 250);
  const [matches, setMatches] = useState<SubcategoryOption[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!debounced || !open || !parentCategoryId) { setMatches([]); return; }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const res = await requestJson<SimilarityCandidate[]>("/api/forms/subcategories/similar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: debounced, categoryId: parentCategoryId }),
      });
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setMatches(
          res.data.slice(0, 3).map((m) => ({
            subcategoryId: m.id,
            name: m.name,
            categoryId: parentCategoryId,
          })),
        );
      } else {
        toast.error(res.message);
      }
    })();
    return () => { cancelled = true; };
  }, [debounced, open, parentCategoryId]);

  async function handleCreate() {
    const name = query.trim();
    if (!name || !parentCategoryId) return;
    setCreating(true);
    const res = await requestJson<SubcategoryOption>("/api/forms/subcategories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, categoryId: parentCategoryId }),
    });
    setCreating(false);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success(`Created "${res.data.name}"`);
    onChange(res.data);
    setQuery(res.data.name);
    setOpen(false);
  }

  const exact = matches.find(
    (m) => m.name.trim().toLowerCase() === query.trim().toLowerCase(),
  );

  return (
    <div className="relative flex flex-col gap-2">
      <label className="font-label-md text-label-md uppercase text-on-surface-variant">
        {label}
        {required && " *"}
      </label>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search or create…"
        aria-required={required}
        aria-expanded={open}
        className="h-11 w-full rounded border border-outline bg-surface-container-lowest px-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {open && (matches.length > 0 || (query.trim() && !exact)) && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-md">
          <ul aria-busy={loading} className="divide-y divide-outline-variant">
            {matches.map((s) => (
              <li key={s.subcategoryId}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(s);
                    setQuery(s.name);
                    setOpen(false);
                  }}
                  className="w-full px-4 py-3 text-left font-body-md text-body-md hover:bg-surface-container-low"
                >
                  {s.name}
                </button>
              </li>
            ))}
            {query.trim() && !exact && (
              <li>
                <button
                  type="button"
                  disabled={creating}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void handleCreate();
                  }}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left font-label-md text-label-md uppercase text-primary hover:bg-surface-container-low disabled:opacity-60"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
                  {creating ? "Creating…" : `Create "${query.trim()}"`}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
