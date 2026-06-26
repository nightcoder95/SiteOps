# Global Remarks Search — Spec & Implementation Plan

**Date:** 2026-06-26
**Status:** Ready for implementation. Scope finalized (see §2, §12).
**Owner:** lalit.sharma@procurie.com

---

## 1. Summary

Add a **global, cross-site search** over the free-text notes of daily logs —
`remarks` for labour/material/machinery and `description` for expense. A
search icon in the top bar opens a full-screen command-palette overlay. As the
user types, trigram-ranked suggestions stream in (≤7), each showing a remark
snippet plus its site · operation · date. Selecting a suggestion deep-links to
the entry. Pressing Enter (or "See all results") switches the overlay into a
paginated results view. Matching is typo-tolerant via PostgreSQL `pg_trgm`.

Goals: fast (sub-150ms perceived), realtime-as-you-type, role-scoped, no UI
clutter, zero new heavy infra (no websockets, no external search service).

---

## 2. Scope

### In scope — searched sources
| Source table        | `type` token | Searched column         | Has view page? | Deep-link |
|---------------------|--------------|-------------------------|----------------|-----------|
| `labour_entries`    | `labour`     | `remarks` (nullable)    | ✅ operations  | full      |
| `material_entries`  | `material`   | `remarks` (nullable)    | ✅ operations  | full      |
| `machinery_entries` | `machinery`  | `remarks` (nullable)    | ✅ operations  | full      |
| `expense_entries`   | `expense`    | `description` (NOT NULL) | ✅ operations  | full      |

> All four map to the existing operations route (`allowedTypes`:
> labour/material/machinery/expense/incident) → every hit deep-links cleanly.
> `expense_entries` has no `remarks` column, so its **`description`** field is
> searched instead (varchar(500), NOT NULL).

### Out of scope (v1)
- `generic_entries` and `resource_transfers` — both have a `remarks` column but
  **no end-user view surface** to deep-link to (decided 2026-06-26; revisit if/when
  those views exist). `incident_reports` (`description`) also excluded for v1.
- Searching any field other than the per-source note column (no site name / type
  / amount search).
- Search history sync across devices (recent searches are localStorage-only).
- Server-side ranking beyond trigram similarity + recency.
- Saved searches, filters persistence in URL.

---

## 3. Architecture overview

```
AppHeader (search icon)
   │ tap / Cmd-K
   ▼
GlobalSearchOverlay (client, full-screen, framer-motion)
   │  debounced query (180ms) → SWR key ['/api/search/remarks?q=…']
   ▼
GET /api/search/remarks  (withApi → rateLimit → auth → scope → query)
   │
   ▼
searchRemarks()  (lib/db/queries/search.ts)
   │  withStatementTimeout( tx → UNION ALL across 4 sources, trgm-ranked )
   ▼
Postgres (pg_trgm GIN indexes per remarks column)
```

Single endpoint serves both suggestion mode (`limit=7`) and results mode
(`limit=50&offset=N`). One SQL round-trip per query.

---

## 4. Data layer

### 4.1 Migration `0023_remarks_trgm_search.sql`

Idempotent, transaction-wrapped, re-run safe. Applied to the **live DB directly**
(`psql "$DIRECT_URL" -f …` or `sql.unsafe(file)`) — the DB is push-managed, not
migrate-managed (see migration-lineage memory). Also add the v7 snapshot
`meta/0023_snapshot.json` (copy `0022`, new `id`, `prevId`=0022 id, apply deltas)
and a `_journal.json` entry.

```sql
-- 0023_remarks_trgm_search.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS labour_entries_remarks_trgm_idx
  ON labour_entries USING gin (remarks gin_trgm_ops);
CREATE INDEX IF NOT EXISTS material_entries_remarks_trgm_idx
  ON material_entries USING gin (remarks gin_trgm_ops);
CREATE INDEX IF NOT EXISTS machinery_entries_remarks_trgm_idx
  ON machinery_entries USING gin (remarks gin_trgm_ops);
CREATE INDEX IF NOT EXISTS expense_entries_description_trgm_idx
  ON expense_entries USING gin (description gin_trgm_ops);
```

Notes:
- `CREATE INDEX` (not `CONCURRENTLY`) inside the idempotent script — tables are
  small today and the script runs in a transaction. If a table is large at apply
  time, run that one index `CONCURRENTLY` **outside** the txn manually. Documented
  in the runbook section of the PR.
- `gin_trgm_ops` supports both `LIKE/ILIKE` and the `%` similarity operator.

### 4.2 Query module `lib/db/queries/search.ts`

```ts
export type SearchSource = 'labour' | 'material' | 'machinery' | 'expense';

export interface SearchHit {
  source: SearchSource;
  entryId: string;     // the *_id uuid for that source row
  siteId: string;
  siteName: string;
  date: string;        // ISO date
  snippet: string;     // server-trimmed ~140 chars, match-centered
  similarity: number;  // 0..1 — over remarks (l/m/m) or description (expense)
}

export async function searchRemarks(params: {
  q: string;
  limit: number;
  offset: number;
  scope: { isAdmin: boolean; siteIds: string[] }; // siteIds ignored when isAdmin
}): Promise<{ hits: SearchHit[]; hasMore: boolean }>;
```

Implementation:
- Wrap in `withStatementTimeout(fn, 5_000)` — search is interactive; a 5s ceiling
  reaps orphaned keystroke queries fast and keeps pooler slots clean (pooler
  statement_timeout memo).
- One parameterised SQL via `sql`-tagged template (NEVER string-concatenate `q`).
  Trigram threshold set per-transaction: `SET LOCAL pg_trgm.similarity_threshold = 0.15`
  (or use `word_similarity`/`%>` for prefix-ish matches — see §7.2).
- Structure:

```sql
WITH q AS (SELECT $1::text AS term)
SELECT * FROM (
  SELECT 'labour' AS source, le.labour_entry_id::text AS entry_id,
         le.site_id::text AS site_id, s.name AS site_name, le.date::text AS date,
         le.remarks AS note, similarity(le.remarks, q.term) AS sim
  FROM labour_entries le JOIN sites s ON s.site_id = le.site_id, q
  WHERE le.remarks IS NOT NULL
    AND (le.remarks % q.term OR le.remarks ILIKE '%'||q.term||'%')
    AND ($2::boolean OR le.site_id = ANY($3::uuid[]))
  UNION ALL
  SELECT 'material', me.material_entry_id::text, me.site_id::text, s.name,
         me.date::text, me.remarks, similarity(me.remarks, q.term)
  FROM material_entries me JOIN sites s ON s.site_id = me.site_id, q
  WHERE me.remarks IS NOT NULL
    AND (me.remarks % q.term OR me.remarks ILIKE '%'||q.term||'%')
    AND ($2::boolean OR me.site_id = ANY($3::uuid[]))
  UNION ALL
  SELECT 'machinery', mc.machinery_entry_id::text, mc.site_id::text, s.name,
         mc.date::text, mc.remarks, similarity(mc.remarks, q.term)
  FROM machinery_entries mc JOIN sites s ON s.site_id = mc.site_id, q
  WHERE mc.remarks IS NOT NULL
    AND (mc.remarks % q.term OR mc.remarks ILIKE '%'||q.term||'%')
    AND ($2::boolean OR mc.site_id = ANY($3::uuid[]))
  UNION ALL
  -- expense: search DESCRIPTION (no remarks col); description is NOT NULL
  SELECT 'expense', ee.expense_entry_id::text, ee.site_id::text, s.name,
         ee.date::text, ee.description, similarity(ee.description, q.term)
  FROM expense_entries ee JOIN sites s ON s.site_id = ee.site_id, q
  WHERE (ee.description % q.term OR ee.description ILIKE '%'||q.term||'%')
    AND ($2::boolean OR ee.site_id = ANY($3::uuid[]))
) hits
ORDER BY sim DESC, date DESC
LIMIT $4 OFFSET $5;
```

- `$2` = isAdmin, `$3` = accessible siteIds array, `$4` = limit+1 (fetch one extra
  to compute `hasMore`), `$5` = offset.
- The `ILIKE '%term%'` OR-branch (§7.2) is folded into each WHERE so exact
  substrings always surface; both operators use the same GIN trigram index.
- Note column aliased `note` in the first branch; all four return the same shape.
- **Snippet** computed in JS after fetch (trim to ~140 chars centered on first
  case-insensitive match index) to keep SQL simple and avoid `ts_headline` cost.
- `hasMore = rows.length > limit`; slice to `limit` before returning.

### 4.3 Scope resolution

```ts
// In the route handler:
const isAdmin = can(role, 'resource:manage_all');         // Admin today
const siteIds = isAdmin ? [] : (await getSitesBySupervisor(userId)).map(s => s.siteId);
```
- Admin → `isAdmin=true`, site filter bypassed in SQL.
- Supervisor → only sites where `supervisorId = userId`. Empty array ⇒ no results
  (the `= ANY('{}'::uuid[])` is always false), which is correct.
- Reuses existing `getSitesBySupervisor` (lib/db/queries/sites.ts) and `can`
  (lib/auth/capabilities) — no new authz primitive, no role-string literals.

---

## 5. API layer

### 5.1 `app/api/search/remarks/route.ts`

```ts
export const GET = withApi(async ({ request, requestId }) => {
  const auth = await requireAuth(request);
  if (!('session' in auth)) return errorResponse(auth.error, 'Authentication required', auth.status, undefined, requestId);

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const limit = clampInt(url.searchParams.get('limit'), 7, 1, 50);
  const offset = clampInt(url.searchParams.get('offset'), 0, 0, 1000);

  // NOTE verified signature: successResponse(data, status, requestId) — status is
  // the 2nd positional arg (default 200), requestId is 3rd. Do NOT pass requestId 2nd.
  if (q.length < 2) return successResponse({ hits: [], hasMore: false }, 200, requestId);
  if (q.length > 100) return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Query too long', 400, undefined, requestId);

  const { role, id: userId } = auth.session.user; // SessionUser = { id, role } (verified)
  const isAdmin = isRole(role) && can(role, 'resource:manage_all');
  const siteIds = isAdmin ? [] : (await getSitesBySupervisor(userId)).map(s => s.siteId);
  if (!isAdmin && siteIds.length === 0) return successResponse({ hits: [], hasMore: false }, 200, requestId);

  try {
    const result = await searchRemarks({ q, limit, offset, scope: { isAdmin, siteIds } });
    return successResponse(result, 200, requestId);
  } catch (error) {
    // handleDbError has NO 57014 case today — it returns null for unknown codes.
    // So: try it first; if null (e.g. statement_timeout 57014), return an explicit
    // 503 "Search timed out, try a shorter query". Optionally extend handleDbError
    // with a 57014 → 503 case (small, shared) as part of this work.
    const mapped = handleDbError(error, requestId);
    if (mapped) return mapped;
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Search failed', 503, undefined, requestId);
  }
});
```

- `withApi` gives request-id, structured logging, and **rate limiting** for free.
- `requireAuth` (not `requireSiteAccess`) — search is cross-site; scoping is done
  in-query, not per-site.
- Validation: `q` trimmed; `< 2` chars → empty (no DB hit, kills noise); `> 100`
  → 400. `limit`/`offset` clamped server-side regardless of client.
- Response envelope via `successResponse(data, 200, requestId)` (matches every
  other route). `clampInt` is a small new helper in `lib/http/request.ts` (or
  colocated) — parse int, default + min/max bounds.

### 5.2 Rate limiting

`applyRateLimit` keys on `user:{id}:{pathname}`. As-you-type fires many requests.
Mitigations, in order:
1. **Client debounce 180ms + min-length 2** → caps request rate per user.
2. **SWR dedupe** (same key within `dedupingInterval` collapses).
3. Limiter (verified): `slidingWindow(60, "1 m")` keyed `user:{id}:{pathname}` →
   60 req/min per user for `/api/search/remarks`. With 180ms debounce + min-2 +
   SWR dedupe a normal search session stays well under 60, so the existing global
   bucket is adequate — no per-path bucket needed. Disabled when
   `NODE_ENV !== "production"`, so dev typing is never throttled.

---

## 6. Client layer

### 6.1 Files
- `components/app-shell/AppHeader.tsx` — add `Search` icon button left of bell;
  controls overlay open state (lifted to a context or local state + portal).
- `components/search/GlobalSearchOverlay.tsx` — full-screen overlay, input,
  suggestion list, results mode, recent searches.
- `components/search/SearchHitRow.tsx` — the 2-line rich row (shared by both modes).
- `components/search/useGlobalSearch.ts` — debounce + SWR + keyboard nav hook.
- `lib/http/searchKeys.ts` — key builder `searchKey(q, limit, offset)`.
- `lib/search/snippet.ts` + `highlight.ts` — pure helpers (unit-tested).

### 6.2 Data fetching
```ts
const debounced = useDebouncedValue(query, 180);
const key = debounced.length >= 2 ? searchKey(debounced, mode === 'results' ? 50 : 7, offset) : null;
const { data, isLoading } = useApiQuery<SearchResponse>(key, {
  keepPreviousData: true,        // no flicker between keystrokes
  dedupingInterval: 300,
  revalidateOnFocus: false,
});
```
- `key = null` when `< 2` chars ⇒ SWR skips the fetch entirely.
- `keepPreviousData` keeps last hits visible while next loads → "instant" feel.
- Stale-response ordering: SWR guarantees the resolved data matches the **current**
  key, so an out-of-order slow response for an old query cannot overwrite a newer
  one (race handled by SWR key identity — see §8).

### 6.3 Keyboard & a11y
- `Cmd/Ctrl-K` opens; `Esc` closes; `↑/↓` move active suggestion; `Enter` selects
  active or, if none active, enters results mode; `Tab` trapped within overlay.
- `role="dialog" aria-modal="true"`, focus moved to input on open, focus restored
  to the trigger on close. Listbox semantics (`role="listbox"/"option"`,
  `aria-activedescendant`) for suggestions. `aria-live="polite"` count announcement.

---

## 7. UX detail

### 7.1 Suggestion row (≤7)
```
🔨  …needs a work permit before pour…          ← snippet, match bolded
    SATHEESH · Labour · 24 Jun                  ← site · type · date, muted
```
- Source icon per `source`. Snippet match-centered, keyword `<mark>`-highlighted
  (XSS-safe: render via React text nodes + split, never `dangerouslySetInnerHTML`).
- Empty query → "Recent searches" (localStorage, last 5, click to refill).
- Pinned footer: **"See all results for '{q}' →"**.
- Loading: skeleton rows (not spinner) to avoid layout jump.
- No matches: "No remarks match '{q}'" + "Check spelling — search is typo-tolerant".

### 7.2 Matching behaviour
- `remarks % term` (trigram similarity above threshold) gives typo tolerance
  ('permt' → 'permit'). Threshold `0.15` via `SET LOCAL pg_trgm.similarity_threshold`.
- For short/prefix queries trigram alone can miss; add an OR `remarks ILIKE '%'||term||'%'`
  branch so exact substrings always surface even below the similarity floor. Both
  use the same GIN index. Ranking still by `similarity()` so exact matches sort high.
- Decision: include the ILIKE OR-branch (cheap, same index) — covers the "type
  'permit', want every literal mention" case the user described.

### 7.3 Results mode (same overlay, no navigation)
- Header: query echo + "{n} results" (or "{n}+ " when `hasMore`).
- Filter chips (client-side over loaded hits): All / Labour / Material / Machinery
  / Expense. Optional site chip.
- Flat list ranked by similarity (default). Toggle "Group by site".
- Infinite scroll: on sentinel intersect, refetch with `offset += 50` and append.
- Tap row → same deep-link as suggestion select.

### 7.4 Deep-link (flow A)
- All four sources → `router.push('/app/sites/{siteId}/operations/{type}?highlight={entryId}&date={date}')`.
  `OperationDetailPageClient` reads `highlight`: expands the matching date group,
  `scrollIntoView({block:'center'})`, applies a 2s ring/pulse, then strips the
  param (`router.replace`) so refresh doesn't re-pulse.
- `type` token maps 1:1 to source (`expense` → expense operations view). Single
  deep-link path, no special-casing.

---

## 8. Race conditions & edge cases

| # | Scenario | Handling |
|---|----------|----------|
| 1 | Out-of-order responses (fast typing) | SWR binds data to current key; stale key's resolution is ignored. `keepPreviousData` shows last good set meanwhile. |
| 2 | Empty / whitespace / 1-char query | Client sets key=null; server also guards `< 2` → `{hits:[],hasMore:false}`. No DB hit. |
| 3 | Query > 100 chars | Server 400; client caps input maxLength=100. |
| 4 | SQL injection via `q` | Parameterised `sql` template only. No interpolation. `%` operator on a bound param. |
| 5 | Supervisor with 0 sites | `siteIds=[]` → early empty return; SQL `= ANY('{}')` false anyway (defense in depth). |
| 6 | Entry deleted between suggestion and tap | Deep-link lands; operation page simply doesn't find `highlight` id → no pulse, no error (graceful). |
| 7 | Orphaned keystroke query (user closes overlay) | `withStatementTimeout(5s)` reaps; pooler slot returns clean. |
| 8 | Rate limit hit (429) | Client shows inline "Searching paused, slow down" toast; SWR error surfaced via `notifyError`; auto-recovers next debounce window. |
| 9 | Pagination overlap/dup while appending | Dedup appended hits by `(source,entryId)` key before render. |
| 10| Overlay open during route change | Close overlay on `pathname` change (cleanup effect). |
| 11| Multi-row merged entries (operations page merges same date+category) | `highlight` matches any constituent entryId → expand that merged group. |
| 12| Expense has no remarks | Expense branch searches `description` (NOT NULL) — no NULL guard needed there; other three guard `remarks IS NOT NULL`. |
| 13| Remarks NULL | `WHERE remarks IS NOT NULL` in labour/material/machinery branches; GIN index skips NULLs. |
| 14| Unicode / emoji in remarks | trigram is byte/char aware in PG; snippet trim uses `Array.from` for code-point safety. |

---

## 9. Performance

- **Indexes:** one GIN trigram index per remarks column → `%` and `ILIKE` both
  index-assisted. Without them this is a 4-way seq scan; with them, sub-ms per
  branch at current volume.
- **Single round-trip:** UNION ALL, server-side ORDER BY + LIMIT. No N+1, no app-side
  merge of 5 queries.
- **Payload:** snippet (≤140 chars) not full remarks; ≤7 rows in suggestion mode.
- **`limit+1` trick** for `hasMore` avoids a second COUNT query.
- **Client:** debounce 180ms, min-length 2, SWR dedupe + keepPreviousData. Service
  worker SWR cache (existing) compounds on repeat queries.
- **Timeout ceiling 5s** prevents pool starvation from abandoned queries.
- **Cost guard:** `EXPLAIN ANALYZE` the UNION on prod-like data before launch;
  verify GIN index usage on each branch (checklist §11).

---

## 10. Security

- **Authz in-query:** every branch filters by accessible site set unless Admin.
  No note crosses a supervisor's site boundary. All four branches scope on
  `site_id`. Tested explicitly (§11).
- **Authn:** `requireAuth` gate; unauthenticated → 401 before any DB work.
- **Injection:** parameterised queries only; `q` never concatenated.
- **XSS:** highlight rendered via React text nodes; no raw HTML.
- **Enumeration / abuse:** rate limiting via `withApi`; min-length + debounce.
- **PII:** remarks may contain sensitive notes — results limited to the requester's
  authorized sites; no caching of results in shared/server caches beyond the
  per-user SWR + SW cache (per-user scoped).
- **Logging:** do **not** log raw `q` or snippets at info level (could leak PII);
  log only `q.length` and hit count.

---

## 11. Test plan

### Unit (vitest)
- `snippet.ts`: match-centering, truncation, no-match fallback, code-point safety.
- `highlight.ts`: correct split/mark, no HTML injection, multiple occurrences,
  case-insensitive.
- `searchKey`: stable serialization, null below min-length.
- `clampInt`: bounds, NaN, negative, over-max.

### Query / integration (vitest + test DB)
- Trigram match returns expected rows; typo ('permt') still matches 'permit'.
- ILIKE branch surfaces exact substring below similarity floor.
- Ordering: higher similarity first, then recency.
- `limit+1` → correct `hasMore`.
- **Scope:** Admin sees all sites' remarks; Supervisor sees only own; supervisor
  with 0 sites → empty; no note from a non-owned site appears for a supervisor.
- NULL remarks excluded.
- `q` with `%`, `_`, quotes, `;`, emoji → safe, no injection, correct results.

### API (route test)
- 401 unauthenticated.
- `q` < 2 → empty, no DB call (spy).
- `q` > 100 → 400.
- limit/offset clamped.
- 429 path returns rate-limit envelope.
- timeout (57014) mapped to clean error.

### Component (RTL)
- Overlay open/close (icon, Cmd-K, Esc), focus trap + restore.
- Debounce: N keystrokes → 1 fetch.
- keepPreviousData: old rows persist during load.
- Keyboard nav selects correct hit; Enter→results mode.
- Recent searches persist/recall.
- Deep-link pushes correct URL per source.

### E2E (playwright)
- Type 'permit' → suggestions appear → select → land on operation page with the
  entry highlighted.
- Type → Enter → results mode → filter chip → infinite scroll appends.
- Supervisor login: no other-site remark appears.

---

## 12. Resolved decisions

**D1 — scope (RESOLVED 2026-06-26):** Search **four** sources, all with existing
operations view pages → clean deep-link for every hit:
`labour_entries.remarks`, `material_entries.remarks`, `machinery_entries.remarks`,
`expense_entries.description`. `generic_entries` and `resource_transfers` are
**excluded** (no end-user view surface to deep-link to). Expense is searched on its
`description` column since it has no `remarks`.

**D2 — recents storage (RESOLVED):** localStorage only, last 5, no server sync.

---

## 13. File manifest

New:
- `lib/db/migrations/0023_remarks_trgm_search.sql` (+ `meta/0023_snapshot.json`, journal entry)
- `lib/db/queries/search.ts`
- `app/api/search/remarks/route.ts`
- `lib/http/searchKeys.ts`
- `lib/search/snippet.ts`, `lib/search/highlight.ts`
- `components/search/GlobalSearchOverlay.tsx`, `SearchHitRow.tsx`, `useGlobalSearch.ts`
- Tests alongside each.

Modified:
- `components/app-shell/AppHeader.tsx` (search icon + overlay mount)
- `app/app/sites/[id]/operations/[type]/OperationDetailPageClient.tsx` (`highlight` param handling)

---

## 14. Rollout / runbook

1. ✅ Applied `0023` SQL to the live DB (dev DB == prod DB) — pg_trgm + all 4 GIN
   indexes verified present. No separate prod migration step.
2. ✅ Rate limit verified adequate (60/min per user per path; see §5.2).
3. Ship behind no flag (additive, read-only) — or a simple env/feature gate if
   preferred for staged rollout.
4. Post-deploy: monitor p95 of `/api/search/remarks` via existing api_request logs.
