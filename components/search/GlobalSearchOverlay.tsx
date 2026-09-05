'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Search, X, ArrowLeft, CornerDownLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { SearchHitRow } from '@/components/search/SearchHitRow';
import { useBackDismiss } from '@/lib/nav/useBackDismiss';
import { hitHref, useGlobalSearch } from '@/components/search/useGlobalSearch';
import type { SearchHit, SearchSource } from '@/components/search/useGlobalSearch';

type Props = {
  open: boolean;
  onClose: () => void;
};

const SOURCE_FILTERS: Array<{ value: SearchSource | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'labour', label: 'Labour' },
  { value: 'material', label: 'Material' },
  { value: 'machinery', label: 'Machinery' },
  { value: 'expense', label: 'Expense' },
];

export function GlobalSearchOverlay({ open, onClose }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sourceFilter, setSourceFilter] = useState<SearchSource | 'all'>('all');

  const search = useGlobalSearch();
  const {
    query,
    setQuery,
    mode,
    canSearch,
    suggestions,
    suggestionsLoading,
    activeIndex,
    activeHit,
    moveActive,
    results,
    resultsHasMore,
    resultsLoading,
    enterResults,
    loadMore,
    backToSuggest,
    recents,
  } = search;

  // Focus the input when the overlay opens.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  // Set when the overlay closes because we are navigating to a hit, so the
  // teardown below leaves the router's new history entry alone.
  const navigatingRef = useRef(false);

  // Browser back / the phone back gesture closes the overlay rather than
  // navigating the page away. navigatingRef opts teardown out of popping the
  // sentinel when the close was itself a navigation to a hit.
  useBackDismiss(open, onClose, { navigatingRef });

  const handleSelect = (hit: SearchHit) => {
    navigatingRef.current = true;
    onClose();
    router.push(hitHref(hit));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (mode === 'results') backToSuggest();
      else onClose();
      return;
    }
    if (mode !== 'suggest') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeHit) handleSelect(activeHit);
      else if (canSearch) enterResults(query);
    }
  };

  const filteredResults = useMemo(
    () => (sourceFilter === 'all' ? results : results.filter((r) => r.source === sourceFilter)),
    [results, sourceFilter],
  );

  // Infinite-scroll sentinel for results mode.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mode !== 'results' || !resultsHasMore) return undefined;
    const node = sentinelRef.current;
    if (!node) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '200px' },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [mode, resultsHasMore, loadMore, filteredResults.length]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Search remarks"
          className="fixed inset-0 z-[60] bg-[#020617] flex flex-col"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15 }}
          onKeyDown={handleKeyDown}
        >
          {/* Search bar */}
          <div className="safe-area-top border-b border-white/5 px-3 h-14 flex items-center gap-2 shrink-0">
            {mode === 'results' ? (
              <button
                type="button"
                onClick={backToSuggest}
                className="p-2 rounded-xl hover:bg-white/5"
                aria-label="Back to suggestions"
              >
                <ArrowLeft className="w-5 h-5 text-slate-400" />
              </button>
            ) : (
              <Search className="w-5 h-5 text-slate-500 ml-2" aria-hidden />
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (mode === 'results') backToSuggest();
              }}
              maxLength={100}
              placeholder="Search remarks across all sites…"
              className="flex-1 bg-transparent outline-none text-base text-white placeholder:text-slate-400"
              aria-label="Search query"
              autoComplete="off"
              role="combobox"
              aria-expanded={suggestions.length > 0}
              aria-controls="search-suggestion-list"
              aria-activedescendant={
                activeIndex >= 0 ? `search-option-${activeIndex}` : undefined
              }
            />
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white shadow-xs transition-all hover:bg-white/20 hover:border-white/30 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer"
              aria-label="Close search"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain pb-28">
            {mode === 'suggest' ? (
              <SuggestBody
                query={query}
                canSearch={canSearch}
                suggestions={suggestions}
                loading={suggestionsLoading}
                activeIndex={activeIndex}
                recents={recents}
                onSelect={handleSelect}
                onPickRecent={(term) => setQuery(term)}
                onSeeAll={() => enterResults(query)}
              />
            ) : (
              <ResultsBody
                query={query}
                results={filteredResults}
                totalLoaded={results.length}
                hasMore={resultsHasMore}
                loading={resultsLoading}
                sourceFilter={sourceFilter}
                onFilter={setSourceFilter}
                onSelect={handleSelect}
                sentinelRef={sentinelRef}
              />
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function SkeletonRows() {
  return (
    <div className="px-4 py-2 space-y-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-12 rounded-2xl bg-white/5 animate-pulse" />
      ))}
    </div>
  );
}

function SuggestBody(props: {
  query: string;
  canSearch: boolean;
  suggestions: SearchHit[];
  loading: boolean;
  activeIndex: number;
  recents: string[];
  onSelect: (hit: SearchHit) => void;
  onPickRecent: (term: string) => void;
  onSeeAll: () => void;
}) {
  const { query, canSearch, suggestions, loading, activeIndex, recents, onSelect, onPickRecent, onSeeAll } = props;

  if (!canSearch) {
    return (
      <div className="px-4 py-4">
        {recents.length > 0 ? (
          <>
            <p className="text-[11px] uppercase tracking-widest text-slate-600 px-1 mb-2">
              Recent searches
            </p>
            <div className="space-y-1">
              {recents.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => onPickRecent(term)}
                  className="w-full text-left px-4 py-2.5 rounded-2xl hover:bg-white/5 text-sm text-slate-300"
                >
                  {term}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-600 px-1 py-8 text-center">
            Type at least 2 characters to search remarks across every site.
          </p>
        )}
      </div>
    );
  }

  if (loading && suggestions.length === 0) return <SkeletonRows />;

  if (suggestions.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-sm text-slate-300">No remarks match “{query}”.</p>
        <p className="text-xs text-slate-600 mt-1">
          Check the spelling — search is typo-tolerant.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul id="search-suggestion-list" role="listbox" aria-label="Suggestions" className="py-2">
        {suggestions.map((hit, i) => (
          <li key={`${hit.source}:${hit.entryId}`}>
            <SearchHitRow
              hit={hit}
              query={query}
              active={i === activeIndex}
              optionId={`search-option-${i}`}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onSeeAll}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 border-t border-white/5 text-sm text-sky-400 hover:bg-white/5"
      >
        See all results for “{query}”
        <CornerDownLeft className="w-4 h-4" aria-hidden />
      </button>
    </>
  );
}

function ResultsBody(props: {
  query: string;
  results: SearchHit[];
  totalLoaded: number;
  hasMore: boolean;
  loading: boolean;
  sourceFilter: SearchSource | 'all';
  onFilter: (f: SearchSource | 'all') => void;
  onSelect: (hit: SearchHit) => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { query, results, totalLoaded, hasMore, loading, sourceFilter, onFilter, onSelect, sentinelRef } = props;

  return (
    <div>
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <p className="text-sm text-slate-400 truncate">
          Results for <span className="text-white font-semibold">“{query}”</span>
        </p>
        <p className="text-[11px] uppercase tracking-widest text-slate-600 shrink-0 ml-3" aria-live="polite">
          {totalLoaded}
          {hasMore ? '+' : ''} found
        </p>
      </div>

      <div className="px-3 pb-2 flex gap-2 overflow-x-auto">
        {SOURCE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => onFilter(f.value)}
            className={`px-3 py-1 rounded-full text-xs whitespace-nowrap border transition-colors ${
              sourceFilter === f.value
                ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                : 'border-white/10 text-slate-400 hover:bg-white/5'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {results.length === 0 && !loading ? (
        <p className="px-6 py-12 text-center text-sm text-slate-500">
          No results in this category.
        </p>
      ) : (
        <ul className="py-1 pb-10">
          {results.map((hit) => (
            <li key={`${hit.source}:${hit.entryId}`}>
              <SearchHitRow hit={hit} query={query} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}

      {loading ? <SkeletonRows /> : null}
      <div ref={sentinelRef} className="h-px" aria-hidden />
    </div>
  );
}
