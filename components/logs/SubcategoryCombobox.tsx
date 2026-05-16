"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { requestJson } from "@/lib/http/client";
import { AnimatePresence, AnimatedList, AnimatedListItem, motion, transitions } from "@/components/ui/motion";

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

type SimilarityResponse = {
  candidates: SimilarityCandidate[];
  topScore: number;
  recommendedAction: "use_existing" | "create_new";
  requiresReview: boolean;
};

type SubcategoryListResponse = {
  subcategories: Array<{
    subcategoryId: string;
    categoryId: string;
    name: string;
  }>;
};

type SubcategoryCreateResponse = SubcategoryOption & {
  flaggedForReview?: boolean;
};

type Props = {
  label: string;
  parentCategoryId: string;
  value: SubcategoryOption | null;
  onChange: (value: SubcategoryOption | null) => void;
  required?: boolean;
  role: "Admin" | "Supervisor";
  siteId?: string;
};

export function SubcategoryCombobox({
  label, parentCategoryId, value, onChange, required, role, siteId,
}: Props) {
  const [query, setQuery] = useState(value?.name ?? "");
  const debounced = useDebouncedValue(query.trim(), 250);
  const [catalog, setCatalog] = useState<SubcategoryOption[]>([]);
  const [matches, setMatches] = useState<SubcategoryOption[]>([]);
  const [similarity, setSimilarity] = useState<SimilarityResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [confirmOverride, setConfirmOverride] = useState<SimilarityCandidate[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Catalog read via ref so similarity effect doesn't refire on catalog mutate.
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  useEffect(() => {
    if (!parentCategoryId) {
      setCatalog([]);
      setMatches([]);
      setSimilarity(null);
      return;
    }
    const controller = new AbortController();
    setLoadingCatalog(true);
    void (async () => {
      const res = await requestJson<SubcategoryListResponse>(
        `/api/forms/categories/${parentCategoryId}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setLoadingCatalog(false);
      if (!res.ok) {
        if (res.message !== "Request aborted") toast.error(res.message);
        return;
      }
      const next = (res.data.subcategories ?? []).map((item) => ({
        subcategoryId: item.subcategoryId,
        name: item.name,
        categoryId: parentCategoryId,
      }));
      setCatalog(next);
      setMatches(next.slice(0, 8));
    })();
    return () => {
      controller.abort();
    };
  }, [parentCategoryId]);

  useEffect(() => {
    if (!open || !parentCategoryId) return;
    if (!debounced) {
      setSimilarity(null);
      setMatches(catalogRef.current.slice(0, 8));
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      const res = await requestJson<SimilarityResponse>("/api/forms/subcategories/similar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: debounced, categoryId: parentCategoryId }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setLoading(false);
      if (res.ok) {
        setSimilarity(res.data);
        const suggested = res.data.candidates
          .slice(0, 5)
          .map((m) => ({
            subcategoryId: m.id,
            name: m.name,
            categoryId: parentCategoryId,
          }));
        const local = catalogRef.current
          .filter((item) => item.name.toLowerCase().includes(debounced.toLowerCase()))
          .slice(0, 5);
        const combined = [...suggested];
        for (const item of local) {
          if (!combined.find((x) => x.subcategoryId === item.subcategoryId)) combined.push(item);
        }
        setMatches(combined);
      } else if (res.message !== "Request aborted") {
        setSimilarity(null);
        toast.error(res.message);
      }
    })();
    return () => { controller.abort(); };
  }, [debounced, open, parentCategoryId]);

  async function createSubcategory(overrideDuplicateWarning: boolean) {
    const name = query.trim();
    if (!name || !parentCategoryId) return;
    setCreating(true);
    const res = await requestJson<SubcategoryCreateResponse>("/api/forms/subcategories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        categoryId: parentCategoryId,
        overrideDuplicateWarning,
        siteId,
      }),
    });
    setCreating(false);
    if (!res.ok) {
      if (res.status === 409) {
        const details = res.details as
          | { candidates?: SimilarityCandidate[]; requiresReview?: boolean }
          | undefined;
        if (details?.requiresReview && details.candidates?.length) {
          setConfirmOverride(details.candidates);
          return;
        }
      }
      toast.error(res.message);
      return;
    }

    const created = {
      subcategoryId: res.data.subcategoryId,
      name: res.data.name,
      categoryId: parentCategoryId,
    };
    setCatalog((prev) =>
      prev.find((item) => item.subcategoryId === created.subcategoryId)
        ? prev
        : [created, ...prev],
    );
    setConfirmOverride(null);
    if (res.data.flaggedForReview) {
      toast.success(`Created "${res.data.name}" and flagged for admin review`);
    } else {
      toast.success(`Created "${res.data.name}"`);
    }
    onChange(created);
    setQuery(created.name);
    setOpen(false);
  }

  async function handleDelete(option: SubcategoryOption) {
    if (role !== "Admin") return;
    const confirmed = window.confirm(`Delete subcategory "${option.name}"?`);
    if (!confirmed) return;

    // Optimistic remove + selection clear. Rollback both on failure.
    const prevCatalog = catalog;
    const prevMatches = matches;
    const prevValue = value;
    const prevQuery = query;
    setCatalog((p) => p.filter((item) => item.subcategoryId !== option.subcategoryId));
    setMatches((p) => p.filter((item) => item.subcategoryId !== option.subcategoryId));
    if (value?.subcategoryId === option.subcategoryId) {
      onChange(null);
      setQuery("");
    }
    setDeletingId(option.subcategoryId);

    const res = await requestJson<null>(`/api/forms/subcategories/${option.subcategoryId}`, {
      method: "DELETE",
    });
    setDeletingId(null);

    if (!res.ok) {
      setCatalog(prevCatalog);
      setMatches(prevMatches);
      if (prevValue?.subcategoryId === option.subcategoryId) {
        onChange(prevValue);
        setQuery(prevQuery);
      }
      toast.error(res.message);
      return;
    }
    toast.success(`Deleted "${option.name}"`);
  }

  const exact = catalog.find(
    (m) => m.name.trim().toLowerCase() === query.trim().toLowerCase(),
  );
  const showConflict = Boolean(confirmOverride && confirmOverride.length > 0);
  const canCreate = query.trim().length > 0 && !exact;

  return (
    <div className="relative flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="font-label-md text-label-md uppercase text-on-surface-variant">
          {label}
          {required && " *"}
        </label>
        <button
          type="button"
          onClick={() => void createSubcategory(false)}
          disabled={!canCreate || creating}
          className="flex h-8 items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-3 font-label-sm text-label-sm uppercase text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>add</span>
          Add Subcategory
        </button>
      </div>
      <div className="relative">
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
          className="h-11 w-full rounded border border-outline bg-surface-container-lowest px-3 pr-10 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="material-symbols-outlined pointer-events-none absolute inset-y-0 right-3 flex items-center text-on-surface-variant">
          arrow_drop_down
        </span>
      </div>
      {showConflict ? (
        <div className="rounded-xl border border-warning/50 bg-warning/10 p-3">
          <p className="font-label-md text-label-md uppercase text-warning">Similar subcategories found</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {confirmOverride?.slice(0, 4).map((item) => (
              <li
                key={item.id}
                className="rounded-full bg-surface-container-low px-3 py-1 font-label-sm text-label-sm text-on-surface-variant"
              >
                {item.name} ({Math.round(item.score * 100)}%)
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void createSubcategory(true)}
              disabled={creating}
              className="flex h-9 items-center gap-1 rounded bg-primary px-3 font-label-md text-label-md uppercase text-on-primary disabled:opacity-60"
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>flag</span>
              {creating ? "Saving…" : "Create and flag review"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmOverride(null)}
              className="h-9 rounded border border-outline px-3 font-label-md text-label-md uppercase text-on-surface-variant"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      <AnimatePresence>
      {open && (matches.length > 0 || canCreate || loading || loadingCatalog) && (
        <motion.div
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={transitions.fast}
          className="absolute left-0 right-0 top-full z-20 mt-1 origin-top overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-md"
        >
          <AnimatedList aria-busy={loading} className="divide-y divide-outline-variant">
            {loadingCatalog ? (
              <li className="px-4 py-3 font-body-md text-body-md text-on-surface-variant">
                Loading options…
              </li>
            ) : null}
            {matches.map((s) => (
              <AnimatedListItem key={s.subcategoryId}>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(s);
                      setQuery(s.name);
                      setOpen(false);
                    }}
                    className="w-full rounded-md px-2 py-2 text-left font-body-md text-body-md hover:bg-surface-container-low"
                  >
                    {s.name}
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      void handleDelete(s);
                    }}
                    disabled={role !== "Admin" || deletingId === s.subcategoryId}
                    title={role === "Admin" ? "Delete subcategory" : "Only admins can delete subcategories"}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>delete</span>
                  </button>
                </div>
              </AnimatedListItem>
            ))}
            {canCreate && (
              <AnimatedListItem>
                <button
                  type="button"
                  disabled={creating}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void createSubcategory(false);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left font-label-md text-label-md uppercase text-primary hover:bg-surface-container-low disabled:opacity-60"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>add</span>
                  {creating ? "Creating…" : `Create "${query.trim()}"`}
                </button>
              </AnimatedListItem>
            )}
          </AnimatedList>
        </motion.div>
      )}
      </AnimatePresence>
      {similarity?.requiresReview && !showConflict ? (
        <p className="font-label-sm text-label-sm text-warning">
          Similar subcategory detected. New creation will be flagged for admin review.
        </p>
      ) : null}
    </div>
  );
}
