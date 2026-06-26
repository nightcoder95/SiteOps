'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { requestJson } from '@/lib/http/client';
import { useApiQuery } from '@/lib/http/useApiQuery';
import {
  RESULTS_LIMIT,
  SEARCH_MIN_CHARS,
  SUGGESTION_LIMIT,
  searchKey,
} from '@/lib/http/searchKeys';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { notifyError } from '@/lib/ui/toast';
import type { SearchHit, SearchSource } from '@/lib/db/queries/search';

export type { SearchHit, SearchSource };

export interface SearchResponse {
  hits: SearchHit[];
  hasMore: boolean;
}

export type SearchMode = 'suggest' | 'results';

const RECENTS_KEY = 'siteops:recent-searches';
const RECENTS_MAX = 5;

function hitKey(hit: SearchHit): string {
  return `${hit.source}:${hit.entryId}`;
}

function loadRecents(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Deep-link target for a hit: source token maps 1:1 to the operations route. */
export function hitHref(hit: SearchHit): string {
  const params = new URLSearchParams({ highlight: hit.entryId, date: hit.date });
  return `/app/sites/${hit.siteId}/operations/${hit.source}?${params.toString()}`;
}

export function useGlobalSearch() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('suggest');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recents, setRecents] = useState<string[]>([]);

  // Results-mode state (manual paginated fetch with an accumulator).
  const [results, setResults] = useState<SearchHit[]>([]);
  const [resultsHasMore, setResultsHasMore] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const resultsReqId = useRef(0);

  useEffect(() => {
    setRecents(loadRecents());
  }, []);

  const persistRecent = useCallback((raw: string) => {
    const term = raw.trim();
    if (term.length < SEARCH_MIN_CHARS) return;
    setRecents((current) => {
      const next = [term, ...current.filter((r) => r.toLowerCase() !== term.toLowerCase())].slice(
        0,
        RECENTS_MAX,
      );
      try {
        window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        /* storage full / disabled — non-fatal */
      }
      return next;
    });
  }, []);

  // --- Suggestion mode (SWR, debounced) ---
  const debounced = useDebouncedValue(query, 180);
  const suggestKey = mode === 'suggest' ? searchKey(debounced, SUGGESTION_LIMIT) : null;
  // Suggestion errors stay silent — toasting on every keystroke failure is noise.
  // Results-mode errors (an explicit submit) DO toast, below.
  const { data: suggestData, isLoading: suggestFetching } = useApiQuery<SearchResponse>(suggestKey, {
    keepPreviousData: true,
    dedupingInterval: 300,
    revalidateOnFocus: false,
  });
  const suggestions = suggestKey ? (suggestData?.hits ?? []) : [];
  const suggestionsLoading = Boolean(suggestKey) && suggestFetching;

  // Reset keyboard cursor whenever the suggestion list identity changes.
  useEffect(() => {
    setActiveIndex(-1);
  }, [debounced, mode]);

  // --- Results mode (manual, append-on-scroll) ---
  const fetchResults = useCallback(async (term: string, offset: number) => {
    const key = searchKey(term, RESULTS_LIMIT, offset);
    if (!key) return;
    const reqId = (resultsReqId.current += 1);
    setResultsLoading(true);
    const res = await requestJson<SearchResponse>(key);
    // Ignore a stale response superseded by a newer results request.
    if (reqId !== resultsReqId.current) return;
    setResultsLoading(false);
    if (!res.ok) {
      notifyError(res);
      return;
    }
    setResultsHasMore(res.data.hasMore);
    setResults((current) => {
      if (offset === 0) return res.data.hits;
      const seen = new Set(current.map(hitKey));
      return [...current, ...res.data.hits.filter((h) => !seen.has(hitKey(h)))];
    });
  }, []);

  const enterResults = useCallback(
    (term: string) => {
      const t = term.trim();
      if (t.length < SEARCH_MIN_CHARS) return;
      persistRecent(t);
      setMode('results');
      setResults([]);
      setResultsHasMore(false);
      void fetchResults(t, 0);
    },
    [fetchResults, persistRecent],
  );

  const loadMore = useCallback(() => {
    if (resultsLoading || !resultsHasMore) return;
    void fetchResults(query, results.length);
  }, [fetchResults, query, resultsLoading, resultsHasMore, results.length]);

  const backToSuggest = useCallback(() => {
    setMode('suggest');
    setResults([]);
    setResultsHasMore(false);
    setActiveIndex(-1);
  }, []);

  const moveActive = useCallback(
    (delta: number) => {
      setActiveIndex((current) => {
        const count = suggestions.length;
        if (count === 0) return -1;
        const next = current + delta;
        if (next < 0) return count - 1;
        if (next >= count) return 0;
        return next;
      });
    },
    [suggestions.length],
  );

  const activeHit = activeIndex >= 0 ? suggestions[activeIndex] : undefined;

  const canSearch = query.trim().length >= SEARCH_MIN_CHARS;

  return useMemo(
    () => ({
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
      persistRecent,
    }),
    [
      query,
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
      persistRecent,
    ],
  );
}
