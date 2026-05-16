"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { requestJson } from "@/lib/http/client";
import { AnimatedList, AnimatedListItem } from "@/components/ui/motion";

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

type SimilarityResponse = {
  candidates: SimilarityCandidate[];
  topScore: number;
  recommendedAction: "use_existing" | "create_new";
  requiresReview: boolean;
};

type CategoryCreateResponse = CategoryOption & {
  flaggedForReview?: boolean;
};

type Props = {
  initialCategories?: CategoryOption[];
  onSelect: (category: CategoryOption) => void;
  role: "Admin" | "Supervisor";
  siteId?: string;
};

export function CategoryPicker({ initialCategories = [], onSelect, role, siteId }: Props) {
  const [catalog, setCatalog] = useState<CategoryOption[]>(initialCategories);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 250);
  const [matches, setMatches] = useState<CategoryOption[]>(initialCategories.slice(0, 8));
  const [similarity, setSimilarity] = useState<SimilarityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirmOverride, setConfirmOverride] = useState<SimilarityCandidate[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Local catalog is read via ref so this effect only depends on the debounced
  // query — mutations to `catalog` (create/delete) no longer trigger a spurious
  // similarity refetch. AbortController cancels in-flight requests on rerun and
  // unmount, fixing duplicate StrictMode requests + stale-result races.
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  useEffect(() => {
    if (!debounced) {
      setSimilarity(null);
      setMatches(catalogRef.current.slice(0, 8));
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    void (async () => {
      const res = await requestJson<SimilarityResponse>("/api/forms/categories/similar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: debounced }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setLoading(false);
      if (res.ok) {
        setSimilarity(res.data);
        const suggested = res.data.candidates
          .slice(0, 5)
          .map((c) => ({ categoryId: c.id, name: c.name }));
        const local = catalogRef.current
          .filter((c) => c.name.toLowerCase().includes(debounced.toLowerCase()))
          .slice(0, 5);
        const combined = [...suggested];
        for (const item of local) {
          if (!combined.find((x) => x.categoryId === item.categoryId)) combined.push(item);
        }
        setMatches(combined);
      } else if (res.message !== "Request aborted") {
        setSimilarity(null);
        toast.error(res.message);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [debounced]);

  async function createCategory(overrideDuplicateWarning: boolean) {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    const res = await requestJson<CategoryCreateResponse>("/api/forms/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, overrideDuplicateWarning, siteId }),
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
      categoryId: res.data.categoryId,
      name: res.data.name,
      icon: res.data.icon ?? null,
    };
    setCatalog((prev) =>
      prev.find((item) => item.categoryId === created.categoryId) ? prev : [created, ...prev],
    );
    setConfirmOverride(null);
    if (res.data.flaggedForReview) {
      toast.success(`Created "${created.name}" and flagged for admin review`);
    } else {
      toast.success(`Created "${created.name}"`);
    }
    onSelect(created);
  }

  async function handleDelete(category: CategoryOption) {
    if (role !== "Admin") return;
    const confirmed = window.confirm(`Delete category "${category.name}"?`);
    if (!confirmed) return;

    // Optimistic: remove from local lists immediately. Rollback on server error.
    const prevCatalog = catalog;
    const prevMatches = matches;
    setCatalog((prev) => prev.filter((item) => item.categoryId !== category.categoryId));
    setMatches((prev) => prev.filter((item) => item.categoryId !== category.categoryId));
    setDeletingId(category.categoryId);

    const res = await requestJson<null>(`/api/forms/categories/${category.categoryId}`, {
      method: "DELETE",
    });
    setDeletingId(null);

    if (!res.ok) {
      setCatalog(prevCatalog);
      setMatches(prevMatches);
      toast.error(res.message);
      return;
    }
    toast.success(`Deleted "${category.name}"`);
  }

  const exactMatch = catalog.find(
    (m) => m.name.trim().toLowerCase() === query.trim().toLowerCase(),
  );
  const canCreate = query.trim().length > 0 && !exactMatch;
  const showConflict = Boolean(confirmOverride && confirmOverride.length > 0);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-surface-container-lowest p-4 shadow-[0_22px_60px_-38px_rgba(7,162,194,0.7)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-tertiary/15 via-primary/10 to-transparent" />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="font-label-md text-label-md uppercase tracking-[0.14em] text-on-surface-variant">
            Category
          </p>
          <button
            type="button"
            onClick={() => void createCategory(false)}
            disabled={!canCreate || creating}
            className="flex h-9 items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-3 font-label-md text-label-md uppercase text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>add</span>
            Add Category
          </button>
        </div>

        <div className="flex flex-col gap-2">
        <label htmlFor="category-search" className="font-label-md text-label-md uppercase text-on-surface-variant">
          Search
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

      {showConflict ? (
        <div className="rounded-xl border border-warning/50 bg-warning/10 p-3">
          <p className="font-label-md text-label-md uppercase text-warning">Similar categories found</p>
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
              onClick={() => void createCategory(true)}
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

      <AnimatedList className="flex flex-col gap-2" aria-busy={loading}>
        {loading ? (
          <li className="font-body-md text-body-md text-on-surface-variant">Searching…</li>
        ) : null}
        {matches.map((c) => (
          <AnimatedListItem key={c.categoryId}>
            <div className="flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2.5">
              <button
                type="button"
                onClick={() => onSelect(c)}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left active-press"
              >
                <span className="flex min-w-0 items-center gap-2 font-body-md text-body-md font-medium text-on-surface">
                  <span className="material-symbols-outlined text-primary" style={{ fontSize: "20px" }}>
                    {c.icon ?? "category"}
                  </span>
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="flex items-center gap-1 font-label-md text-label-md uppercase text-primary">
                  Use
                  <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>arrow_forward</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(c)}
                disabled={role !== "Admin" || deletingId === c.categoryId}
                title={role === "Admin" ? "Delete category" : "Only admins can delete categories"}
                className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>delete</span>
              </button>
            </div>
          </AnimatedListItem>
        ))}
        {!loading && matches.length === 0 && query && (
          <li className="font-body-md text-body-md text-on-surface-variant">No matches.</li>
        )}
      </AnimatedList>

      {canCreate && !showConflict ? (
        <button
          type="button"
          onClick={() => void createCategory(false)}
          disabled={creating}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/50 bg-primary/5 px-4 py-3 font-label-md text-label-md uppercase text-primary disabled:opacity-60"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>add</span>
          {creating ? 'Creating…' : `Create "${query.trim()}"`}
        </button>
      ) : null}
      {similarity?.requiresReview && !showConflict ? (
        <p className="font-label-sm text-label-sm text-warning">
          Similar category detected. Creating a new one will require admin review.
        </p>
      ) : null}
      </div>
    </div>
  );
}
