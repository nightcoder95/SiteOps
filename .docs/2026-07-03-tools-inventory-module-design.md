# Tools Inventory Module — Design

- **Date:** 2026-07-03
- **Status:** Approved (design); pending implementation plan
- **Author:** brainstorming session
- **Scope:** v1 = Admin-only company tool inventory tracking. Supervisor participation deferred but architected for.

---

## 1. Problem & Goal

The client runs a construction company and owns a fleet of shared tools (Manvatti, Pikkas, Kutta, Chatti, Urbana, wood-cutting machine, grinding machine, etc.). These tools are **global company assets**, not site-scoped log entries like labour/materials. The admin needs to:

- Maintain a catalog of tool types with counts.
- Know how many of each tool exist in total, how many sit free in the company godown/warehouse, and how many are deployed at each site.
- Assign/redistribute tools across sites and adjust counts (procure more, retire some).
- Search and track any tool quickly.
- See a full movement history (ledger) plus a live current-state dashboard.

This is a **separate module**, not folded into per-site operations, precisely because tools are company-global.

### Non-goals (v1)

- Supervisor self-service (request/return/assign). Deferred; the permission layer is built so it is a one-line grant later.
- Individual per-unit identity (serial numbers, per-unit condition). Tools are tracked as **fungible counts**, not distinct assets.
- Multiple godowns. Single implicit warehouse/free pool.
- Maintenance scheduling, depreciation, cost tracking per tool.

---

## 2. Core Model — Fungible Counts

A tool type has a **total quantity**. That total is distributed between sites and the warehouse:

```
free (in warehouse/godown) = totalQuantity − Σ(assignments to sites)
```

**Invariant (enforced on every write):**

```
totalQuantity ≥ Σ(assignments)      // never over-assign
every assignment.quantity ≥ 1       // no zero/negative rows
all quantities are integers         // tools counted in whole units
totalQuantity ≥ 0
```

The warehouse/free pool is **implicit** — it is computed, never stored as a row. This is deliberate: a stored free-count is a second source of truth that inevitably drifts. Derive it and it can never be wrong.

Current-state tables (`tools`, `tool_assignments`) are authoritative for reads and invariant checks. An append-only `tool_movements` ledger records history. Every mutation writes both current-state and ledger rows **in the same transaction**, so the ledger always reconciles to current state.

---

## 3. Data Model

All tables new. Follows existing schema conventions in `lib/db/schema.ts`: identity `id`, public `uuid`, audit columns, `varchar` catalog lists, soft-delete where history matters.

### 3.1 `tool_categories`

Managed list (Hand Tool, Power Tool, Equipment, Container, Safety, …). Reuses the catalog-SSoT spirit but as a dedicated small table (tool categories carry a `codePrefix`, unlike generic subcategories).

| Column | Type | Notes |
|---|---|---|
| `id` | identity PK | |
| `category_id` | uuid unique | public id |
| `name` | varchar(100) | unique among active (case-insensitive) |
| `code_prefix` | varchar(8) | e.g. `HND`, `PWR`, `EQP`; used to mint tool codes |
| `is_active` | boolean | deactivate instead of delete when tools reference it |
| `sort_order` | integer | admin-controlled ordering |
| `created_at` / `updated_at` | timestamp | |

- Unique index on `lower(name)` (match existing case-insensitive dedupe).
- Unique index on `code_prefix` (prefixes must not collide).

### 3.2 `tools`

Tool identity + total stock.

| Column | Type | Notes |
|---|---|---|
| `id` | identity PK | |
| `tool_id` | uuid unique | public id |
| `name` | varchar(120) | unique among non-deleted |
| `code` | varchar(20) unique | auto-generated `PREFIX-NNN` |
| `category_id` | uuid FK → tool_categories.category_id | restrict delete |
| `total_quantity` | integer notNull default 0 | ≥ 0 |
| `icon` | varchar(50) | optional lucide icon name (mirrors `sites`/`EntryTypeIcon` pattern) |
| `version` | integer notNull default 0 | optimistic-concurrency token; bumps on every write |
| `is_deleted` | boolean default false | soft delete |
| `created_by_user_id` / `updated_by_user_id` | uuid FK → user_profiles.user_id | |
| `created_at` / `updated_at` | timestamp | |

- `uniqueIndex tools_name_active_uidx on lower(name) where is_deleted = false` (name reusable after delete, matches `sites_name_active_uidx`).
- `uniqueIndex` on `code`.
- `index` on `category_id`.

### 3.3 `tool_assignments`

Distribution of a tool to a site. One row per (tool, site) with a positive quantity. **No warehouse row** — warehouse is `total − Σ`.

| Column | Type | Notes |
|---|---|---|
| `id` | identity PK | |
| `tool_id` | uuid FK → tools.tool_id, onDelete cascade | |
| `site_id` | uuid FK → sites.site_id, onDelete cascade | |
| `quantity` | integer notNull | ≥ 1 (enforced app-side + CHECK) |
| `created_at` / `updated_at` | timestamp | |

- `uniqueIndex tool_assignments_tool_site_uidx on (tool_id, site_id)`.
- `index` on `tool_id`, `index` on `site_id`.
- Postgres `CHECK (quantity >= 1)` as a hard backstop.

### 3.4 `tool_movements` (ledger, append-only)

| Column | Type | Notes |
|---|---|---|
| `id` | identity PK | |
| `movement_id` | uuid unique | |
| `tool_id` | uuid FK → tools.tool_id, onDelete cascade | |
| `from_location` | varchar | `WAREHOUSE` \| `EXTERNAL` \| `<site_id uuid>` |
| `to_location` | varchar | same domain |
| `quantity` | integer notNull | ≥ 1 |
| `kind` | varchar(20) | `opening \| procure \| retire \| assign \| return \| transfer \| adjust` |
| `note` | varchar(500) | optional; auto-notes like `site_archived` |
| `actor_user_id` | uuid FK → user_profiles.user_id, onDelete set null | survives user deletion |
| `created_at` | timestamp | |

- `index (tool_id, created_at desc)` — per-tool timeline.
- `index (created_at desc)` — global feed.
- Site-scoped history derived by filtering `from_location`/`to_location` = site_id (GIN/expression index deferred unless profiling demands it).

**Movement semantics:**

| Kind | from → to | Effect on state |
|---|---|---|
| `opening` | `EXTERNAL` → `WAREHOUSE` | initial stock on tool creation; `total += q` |
| `procure` | `EXTERNAL` → `WAREHOUSE` | buy more; `total += q` |
| `retire` | `WAREHOUSE` → `EXTERNAL` | scrap/remove; `total -= q` (only from free) |
| `assign` | `WAREHOUSE` → `site` | deploy; assignment `+= q` |
| `return` | `site` → `WAREHOUSE` | pull back; assignment `-= q` |
| `transfer` | `site` → `site` | reserved value; **not emitted in v1** (site→site is modelled as `return` + `assign`). Kept in the enum so the ledger schema is forward-stable. |
| `adjust` | reconciliation | manual correction with mandatory note |

`from_location` / `to_location` are **polymorphic strings** (`WAREHOUSE` \| `EXTERNAL` \| a site uuid), intentionally **not** FK-constrained to `sites`. The ledger is append-only history: a movement to a site must survive that site later being archived/deleted. App-side validation guarantees the site exists and is active *at write time* (§6 step 3); the stored string is a historical fact thereafter. `tool_id` **is** FK'd (cascade) because a deleted tool's ledger has no meaning.

---

## 4. Tool Code Generation

Auto-generated, per-category, human-friendly: `<code_prefix>-<zero-padded sequence>`, e.g. `HND-001`, `PWR-004`, `EQP-012`.

- Prefix comes from the tool's category `code_prefix` at creation time and is **frozen into `code`** — renaming a category or its prefix never rewrites existing codes.
- Sequence is the next integer for that prefix. Computed as `max(existing sequence for prefix) + 1` inside the create transaction, `SELECT … FOR UPDATE`-guarded against the category row (or an advisory lock on the prefix) to avoid duplicate codes under concurrent creates.
- Gap-tolerant (deleting `HND-002` does not renumber). Uniqueness guaranteed by the unique index on `code`; a race that produces a dup fails the insert and retries.

---

## 5. Surfaces & Navigation

Two surfaces, both Admin-only in v1, both under `/app`.

### 5.1 Operational hub — `/app/tools` (new route)

The "Company Tools" page. **Not** in the bottom nav. Entry points:

- **Home dashboard summary tile** (primary) — shows total tools · free · deployed; click → `/app/tools`.
- Cross-link from the catalog CTA context.

Contents:

- **Search** — by tool name or code, debounced.
- **Dashboard strip** — total tools, total quantity, free vs deployed, per-category counts, per-site tool load. Read-only aggregates.
- **Tool list** — each row: icon, name, code, category tag, total, **free badge**, expandable multi-site assignment panel (steppers + "add another site" rows), per-tool dirty indicator.
- **Single "Save Changes"** — batch, partial-apply (§6). Conflicts highlighted inline.
- **"Tool missing? Add in catalog →" CTA** — deep-links to `/app/admin/catalog?tab=tools`.
- **Ledger access** — per-tool timeline drawer; link to global movements view.

### 5.2 Tool + category CRUD — `/app/admin/catalog`, new **Tools** sub-tab

Sits beside existing Operations / Units sub-tabs in `CatalogAdminTabs`. Manages:

- **Tools:** create (name + category → auto-code + optional opening stock), edit name/category/icon, delete (guarded, §7).
- **Tool categories:** create/rename/(de)activate, set `code_prefix`, order.

`CatalogAdminTabs` gains **URL-param tab selection** (`?tab=tools`) so the CTA can deep-link. Currently it holds tab in local `useState`; add `useSearchParams` read + `router.replace` on tab change, preserving the local-state UX.

### 5.3 Home dashboard tile

A summary card on `/app/dashboard`: total tools, free, deployed; links to `/app/tools`. Rendered only when `can(role, 'tool:read')`.

### 5.4 Future supervisor access

When capabilities flip, promote the hub to a bottom-nav entry (footer already gates via `can()`) and scope reads to the supervisor's site. CRUD stays admin-only. No structural change.

---

## 6. Batch Save — Partial-Apply (race-safe core)

`POST /api/tools/batch-save`

Payload — only changed tools:

```jsonc
{
  "tools": [
    {
      "toolId": "uuid",
      "version": 7,                       // optimistic token from load
      "totalQuantity": 20,                // optional; omit if total unchanged
      "assignments": [                    // optional; see semantics below
        { "siteId": "uuid", "qty": 8 },
        { "siteId": "uuid", "qty": 5 }
      ]
    }
  ]
}
```

**Field-presence semantics (avoids accidental wipe):**
- `assignments` **present** → it is the *full desired distribution*; the diff inserts/updates/deletes to match exactly (a site omitted from a present array is intentionally removed → `return`).
- `assignments` **omitted** → distribution left untouched; only `totalQuantity` delta applies (pure procure/retire). Sending `totalQuantity` alone must never delete assignments.
- `totalQuantity` **omitted** → total unchanged.
- Both omitted → no-op for that tool.

**Payload caps (zod):** ≤ 200 tools per batch; ≤ 100 assignment rows per tool.

Server processes tools **sequentially on a single pooled connection**, each tool in its **own `BEGIN`/`COMMIT` transaction** (independence → true partial-apply). Sequential + single-connection is deliberate: parallel transactions would multiply connection demand and risk the pooler exhaustion this codebase has already fought (`project_supabase_pooler_statement_timeout`, pool-exhaustion fix history). Each tool's tx is short, so total latency stays bounded even at the 200-tool cap.

For each tool:

1. `SELECT … FOR UPDATE` the `tools` row (serialize concurrent writers on the same tool).
2. If `tool.version !== payload.version` → **conflict**; skip; return fresh state for that tool.
3. Validate (§7 table): `totalQuantity ≥ 0`; every `qty` integer ≥ 1; `Σ qty ≤ totalQuantity`; no duplicate `siteId`; every `siteId` exists, is active, not archived, not deleted.
4. On validation failure → **invalid**; skip; return fresh state + reason.
5. Apply: diff desired vs current assignments (insert new, update changed, delete removed), update `total_quantity`, `version += 1`, `updated_by_user_id`, and **write a `tool_movements` row for each delta** (assign/return/procure/retire) — all inside the transaction.
6. Record **ok** with new version.

Response:

```jsonc
{
  "results": [
    { "toolId": "…", "status": "ok",       "tool": { /* fresh */ } },
    { "toolId": "…", "status": "conflict", "tool": { /* fresh */ } },
    { "toolId": "…", "status": "invalid",  "reason": "sum_exceeds_total", "tool": { /* fresh */ } }
  ]
}
```

UI: applies `ok`, re-renders `conflict`/`invalid` tools with fresh values and a highlight ("changed by someone else — review" / inline error). The good edits are never lost to one bad tool.

**Why partial-apply is safe here:** each tool is an independent aggregate. Its transaction re-reads under a row lock and re-checks the invariant against committed state, so no interleaving can produce `Σ > total`. The version token turns a lost-update into a visible conflict instead of a silent clobber.

Payload cap: max N tools per batch (zod), max M assignment rows per tool — prevents oversized requests.

---

## 7. Edge Cases (exhaustive)

| # | Case | Handling |
|---|---|---|
| 1 | `Σ assigned > total` | Reject tool → `invalid: sum_exceeds_total` |
| 2 | Decrease `total` below current `Σ assigned` | Reject → `invalid: total_below_assigned`; admin must return from sites first (UI guides) |
| 3 | Negative / zero / fractional qty | zod + CHECK reject; integers ≥ 1 (total ≥ 0) |
| 4 | Duplicate `siteId` in one tool's payload | Reject → `invalid: duplicate_site` |
| 5 | Site archived/deleted between load and save | Reject that tool → `invalid: site_unavailable`, fresh state |
| 6 | Concurrent edit of the same tool | `FOR UPDATE` + version mismatch → `conflict`, partial-apply |
| 7 | Delete a tool with units deployed (`Σ > 0`) | Block → require return-all first; OR explicit "force return & delete" that writes `return` movements for every site then soft-deletes, all in one tx |
| 8 | **Site archived OR soft-deleted while holding tools** | Hook **both** site lifecycle transitions (`archived_at` set **and** `is_deleted` set): in the same tx, auto-`return` every assignment for that site to warehouse, ledgered `kind=return, note=site_archived` / `site_deleted`, delete the assignment rows, bump affected tools' `version`. Sites are never hard-deleted (schema uses `archived_at` + `is_deleted`); the FK `onDelete cascade` on `tool_assignments.site_id` is a backstop only. If hard-delete is ever introduced, it must route through this same return-ledger path — a raw cascade would drop assignments without a ledger entry. |
| 9 | Delete/deactivate a category with tools referencing it | Block hard delete (FK restrict); allow deactivate only |
| 10 | Duplicate tool name | Unique index on `lower(name) where not deleted` → 409 |
| 11 | Duplicate code under concurrent create | Unique index on `code`; failed insert retried with next sequence |
| 12 | Oversized batch payload | zod caps on array lengths → 400 |
| 13 | Assign when warehouse empty (`free = 0`) | = case 1 (`Σ > total`) → reject |
| 14 | Retire more than free | Reject → `invalid: retire_exceeds_free` (can only retire from warehouse, not from deployed) |
| 15 | Opening stock on create | Writes `opening` movement; if 0, no movement |
| 16 | Tool with no category (category deleted underneath) | Prevented by FK restrict (case 9); category always present |
| 17 | Assignment qty edited to exactly 0 | Treated as "remove assignment" → delete row + `return` movement |
| 18 | Rename category prefix after codes minted | Existing codes unchanged (frozen); new tools use new prefix |
| 19 | Ledger vs state divergence | Impossible by construction — both written in same tx; `adjust` kind exists for manual reconciliation with mandatory note |
| 20 | Empty payload / no changes | 200 with empty results |

---

## 8. API Surface

Under `app/api/tools/`. All routes guard via `can()` (§9), validate with zod, return the app's standard result envelope, and are covered by the existing rate-limit middleware.

| Method + path | Capability | Purpose |
|---|---|---|
| `GET /api/tools` | `tool:read` | List tools with computed `free`, assignments, `version`. Supports `?q=` search. |
| `GET /api/tools/:id` | `tool:read` | Single tool detail incl. assignments. |
| `POST /api/tools` | `tool:manage` | Create tool (name, category, icon, opening stock) → mints code, writes `opening`. |
| `PATCH /api/tools/:id` | `tool:manage` | Edit name/category/icon (not quantities). |
| `DELETE /api/tools/:id` | `tool:delete` | Soft-delete; guarded (case 7). `?force=true` triggers return-all. |
| `POST /api/tools/batch-save` | `tool:assign` | Partial-apply batch (§6). |
| `GET /api/tools/:id/movements` | `tool:read` | Per-tool ledger (paginated). |
| `GET /api/tools/movements` | `tool:read` | Global ledger with filters (tool, site, kind, date). |
| `GET /api/tools/dashboard` | `tool:read` | Aggregates for the dashboard strip + Home tile. |
| `GET /api/tools/categories` | `tool:read` | List tool categories. |
| `POST /api/tools/categories` | `tool_category:manage` | Create category (name, prefix). |
| `PATCH /api/tools/categories/:id` | `tool_category:manage` | Rename / prefix / (de)activate / reorder. |

`GET /api/tools` returns the free count computed via a single aggregate query (`LEFT JOIN tool_assignments … GROUP BY`), not N+1.

---

## 9. Permissions & Security

### Capabilities (extend `lib/auth/capabilities.ts`)

New capability strings:

```
tool:read           // view tools, dashboard, ledger
tool:manage         // create/edit tool identity + metadata
tool:assign         // distribute/adjust quantities (batch-save)
tool:delete         // soft-delete tools
tool_category:manage
```

- v1: **all five granted to Admin only**. Supervisor set unchanged.
- Future supervisor read = add `tool:read` (site-scoped) to `SUPERVISOR_CAPABILITIES`; future supervisor self-assign = add `tool:assign`. One edit, per the layer's design comment.
- Every route authorizes with `can(role, cap)` — never a role literal. Denials audited via the existing `permission.denied` audit path.

### RLS

Add policies to `tools`, `tool_assignments`, `tool_movements`, `tool_categories` (mirror `0015_rls_policies.sql`):

- Authenticated **read** (sets up future supervisor read).
- **Write** restricted to admin (JWT role claim), matching how other admin-only tables are gated.

### Input & transport

- zod schemas for every body/query param in `lib/validation/schemas.ts`, plus `.test.ts`.
- Upstash rate-limit on `batch-save` and create endpoints (already wired app-wide).
- Drizzle parameterized queries throughout (no string SQL).
- Batch payload size caps to bound work per request.

---

## 10. Ledger & Dashboard

- **Dashboard strip (hub) + Home tile:** total tools, total quantity, free, deployed, per-category counts, per-site tool load. Single aggregate endpoint (`/api/tools/dashboard`); SWR-cached.
- **Per-tool ledger:** drawer opened from a tool row; paginated `GET /api/tools/:id/movements`.
- **Global ledger:** filterable movements view (tool, site, kind, date range) for auditing "who moved what, when."

---

## 11. Client Data Layer

Per repo conventions (`useApiResult` / `useApiQuery` SWR hooks):

- `useTools(query)` — list + free + assignments.
- `useToolDashboard()` — aggregates (Home tile + hub strip).
- `useToolMovements(toolId | filters)` — ledger.
- `useToolCategories()` — categories.
- Mutations (`batch-save`, create, delete, category writes) via the standard mutation wrapper with optimistic update + revalidation; conflicts from partial-apply reconcile the SWR cache with returned fresh state.

---

## 12. UI/UX (built with `ui-ux-pro-max` + `frontend-ui-engineering` at implementation time)

- Tools hub: search, dashboard strip, tool rows with icon / name / code / category tag / total / **free badge** / expandable per-site assignment panel (steppers + add-row), per-tool dirty state, one **Save Changes** (partial-apply), conflict + validation highlighting.
- States: empty (no tools → CTA to catalog), loading skeletons, error toasts (`sonner`), offline/PWA aware.
- Catalog Tools sub-tab: tables for tools + categories with row action menus (mirror existing `CatalogManager` / `RowActionsMenu`).
- Home tile: compact summary card, `can('tool:read')`-gated.
- Motion via `motion/react` consistent with existing nav/list animations.

Detailed visual design (styles, palette, spacing, component structure) is produced during implementation using the UI skills — not fixed here beyond structure and states.

---

## 13. Testing Strategy

- **Unit:** invariant validator (`Σ ≤ total`, integer/positivity), code generator (prefix + sequence, gap tolerance), assignment diff (insert/update/delete deltas), `can()` matrix for `tool:*`.
- **Integration (route + DB):**
  - batch-save partial-apply: mixed `ok` / `conflict` / `invalid` in one request; assert good ones commit, bad ones don't, versions bump correctly.
  - concurrency: two batch-saves on the same tool with the same starting version → exactly one `ok`, one `conflict` (validates `FOR UPDATE` + version).
  - delete guards (deployed tool blocked; force-return path).
  - site-archive auto-return (archiving a site returns its tools, ledgered).
  - code uniqueness under concurrent create.
- **E2E (Playwright):** assign flow end-to-end; over-assign blocked with message; conflict banner on stale save; catalog CTA deep-link lands on Tools sub-tab; ledger drawer shows movements; Home tile → hub navigation.

---

## 14. Performance

- List/dashboard: single aggregate queries with `GROUP BY`, no N+1. Indexes: `tool_assignments(tool_id)`, `(site_id)`; `tool_movements(tool_id, created_at desc)`, `(created_at desc)`; `tools(category_id)`, `code`, `lower(name)`.
- Free count computed on read (cheap aggregate), never stored.
- Search: `ILIKE`/prefix on name+code; add trigram index only if data volume warrants (tool counts are small — dozens, not thousands).
- Client: debounced search + stepper; SWR caching; partial-apply avoids re-fetching the whole page after save.

---

## 15. Migration & Rollout

- Drizzle migration adds 4 tables + indexes + CHECK constraints + RLS policies, following the re-baselined journal procedure (see `project_migration_lineage`).
- Seed the initial tool categories (Hand Tool, Power Tool, Equipment, Container, Safety) and, optionally, the client's known tools (Manvatti, Pikkas, Kutta, Chatti, Urbana, wood-cutting machine, grinding machine) with `code_prefix`es.
- No changes to existing tables except a hook into the site-archive path (case 8).

---

## 16. Open Decisions (defaulted, override if needed)

1. **`transfer` (site→site)** ledger kind: modelled as return+assign for v1 simplicity; direct transfer kind reserved but UI deferred.
2. **Icons:** optional per-tool lucide icon name; falls back to a category default. Not required to ship.
3. **Global ledger view** may ship as a filter on the hub rather than a separate route in v1.

---

## 17. Implementation Plan

Phased, dependency-ordered. Each task lists files touched and acceptance criteria. Build bottom-up (schema → server logic → API → client → UI → tests woven throughout, TDD where logic is non-trivial). Each phase is independently verifiable and commit-worthy.

### Phase 0 — Foundations (schema + migration + capabilities)

**0.1 Schema — add 4 tables**
- File: `lib/db/schema.ts`
- Add `toolCategories`, `tools`, `toolAssignments`, `toolMovements` per §3, with all indexes, unique constraints, and `CHECK (quantity >= 1)` / `CHECK (total_quantity >= 0)`.
- Accept: `drizzle-kit generate` produces a clean migration; types compile.

**0.2 Migration**
- File: `lib/db/migrations/00XX_tools_inventory.sql` (+ journal) following the re-baselined procedure (`project_migration_lineage`).
- Includes: table DDL, indexes, CHECK constraints, FK actions (§3), RLS policies (§9) mirroring `0015_rls_policies.sql`.
- Accept: migration applies to a fresh DB and to a copy of prod schema without error; RLS policies present.

**0.3 Seed**
- File: migration `00XX_seed_tool_categories.sql` (or `lib/db/defaultCatalog.ts` extension).
- Seed categories: Hand Tool (`HND`), Power Tool (`PWR`), Equipment (`EQP`), Container (`CNT`), Safety (`SFT`). Optionally seed client's known tools.
- Accept: categories present with prefixes after migrate.

**0.4 Capabilities**
- File: `lib/auth/capabilities.ts` (+ `capabilities.test.ts`).
- Add `tool:read`, `tool:manage`, `tool:assign`, `tool:delete`, `tool_category:manage` to the `Capability` union and to `ADMIN_CAPABILITIES` only.
- Accept: `can('Admin','tool:assign') === true`; `can('Supervisor','tool:read') === false`; type-checks (exhaustive union forces listing).

### Phase 1 — Domain logic (pure, TDD)

**1.1 Invariant validator**
- File: `lib/tools/invariant.ts` (+ `.test.ts`).
- `validateDistribution({ totalQuantity, assignments })` → ok | typed error (`sum_exceeds_total`, `total_below_assigned`, `duplicate_site`, `non_positive_qty`, `non_integer`, `negative_total`).
- Accept: unit tests cover every branch in §7 table (cases 1–4, 13–14, 17).

**1.2 Code generator**
- File: `lib/tools/code.ts` (+ `.test.ts`).
- `nextToolCode(prefix, existingSequences)` → `PREFIX-NNN`, gap-tolerant, zero-padded.
- Accept: gaps don't renumber; sequence increments from max; padding correct.

**1.3 Assignment diff**
- File: `lib/tools/diff.ts` (+ `.test.ts`).
- `diffAssignments(current, desired)` → `{ inserts, updates, deletes }` + derived movement deltas (assign/return) and total-change deltas (procure/retire).
- Accept: qty→0 yields delete + return movement (case 17); new site yields insert + assign; total up/down yields procure/retire.

### Phase 2 — Server: transactional apply (integration-tested)

**2.1 Batch-save transaction unit**
- File: `lib/tools/applyBatch.ts` (server-only; uses a drizzle tx).
- For one tool: `SELECT … FOR UPDATE`, version check, validate (1.1), diff (1.3), apply current-state writes + ledger writes, bump version. Returns `{ status: ok|conflict|invalid, tool, reason? }`.
- Accept: integration tests — happy apply; stale version → conflict (no writes); invalid → no writes; ledger rows match deltas; version bumps exactly once.

**2.2 Create/delete tool logic**
- File: `lib/tools/manage.ts`.
- Create: mint code (1.2) under lock, insert tool, write `opening` movement if stock > 0.
- Delete: block if `Σ assigned > 0` unless `force` → write `return` for every site then soft-delete, one tx.
- Accept: concurrent-create code uniqueness (case 11); deployed-tool delete blocked (case 7); force path ledgers returns.

**2.3 Site archive/soft-delete hook**
- File: wherever site archive + soft-delete commit (`app/api/sites/[id]/route.ts` + shared helper).
- In the same tx as `archived_at` **or** `is_deleted` being set: auto-`return` all assignments for the site to warehouse, delete assignment rows, ledger `note=site_archived`/`site_deleted`, bump affected tools' versions (case 8).
- Accept: integration tests — archiving *and* soft-deleting a site with tools each zero its assignments, write returns, increase tools' free.

### Phase 3 — API routes

**3.1** `app/api/tools/route.ts` — GET (list + computed free, `?q=`), POST (create). Guard `tool:read` / `tool:manage`.
**3.2** `app/api/tools/[id]/route.ts` — GET, PATCH (`tool:manage`), DELETE (`tool:delete`, `?force`).
**3.3** `app/api/tools/batch-save/route.ts` — POST (`tool:assign`); loops tools, calls 2.1 per tool in its own tx; returns per-tool results (§6). Rate-limited, zod-validated, payload caps.
**3.4** `app/api/tools/[id]/movements/route.ts` + `app/api/tools/movements/route.ts` — GET ledgers (`tool:read`), paginated/filtered.
**3.5** `app/api/tools/dashboard/route.ts` — GET aggregates (`tool:read`).
**3.6** `app/api/tools/categories/route.ts` + `[id]/route.ts` — GET (`tool:read`), POST/PATCH (`tool_category:manage`); category delete blocked when referenced (case 9).
- zod schemas: `lib/validation/schemas.ts` (+ `.test.ts`).
- Accept per route: authz denial audited + 403; validation → 400; happy path returns envelope; `route.test.ts` per route mirroring existing `app/api/catalog/*/route.test.ts`.

### Phase 4 — Client data layer

- File: `lib/client/tools.ts` (or existing hooks location).
- `useTools`, `useToolDashboard`, `useToolMovements`, `useToolCategories` via `useApiResult`/`useApiQuery`; mutation wrappers for batch-save/create/delete/category with optimistic update + conflict reconciliation from returned fresh state (§11).
- Accept: hooks typed; conflict result updates cache to fresh version.

### Phase 5 — UI (ui-ux-pro-max + frontend-ui-engineering)

**5.1 Catalog Tools sub-tab**
- Files: `components/catalog/CatalogAdminTabs.tsx` (add `Tools` tab + `?tab=` URL-param selection), `components/tools/ToolCatalogManager.tsx`, `ToolCategoryManager.tsx` (mirror `CatalogManager`/`RowActionsMenu`).
- Accept: CRUD works; `?tab=tools` deep-link selects the tab; category delete-when-referenced blocked with message.

**5.2 Operational hub**
- Files: `app/app/tools/page.tsx`, `components/tools/ToolsHub.tsx`, `ToolRow.tsx`, `AssignmentPanel.tsx`, `ToolDashboardStrip.tsx`, `ToolLedgerDrawer.tsx`.
- Search, dashboard strip, tool rows with steppers + multi-site panel, per-tool dirty state, single Save (partial-apply), conflict/validation highlight, "Add in catalog" CTA, empty/loading/error states, `sonner` toasts.
- Accept: assign flow works; over-assign blocked inline; conflict banner on stale save; ledger drawer opens.

**5.3 Home tile**
- Files: `app/app/dashboard/page.tsx` (+ `components/tools/ToolSummaryTile.tsx`).
- `can('tool:read')`-gated summary card linking to `/app/tools`.
- Accept: tile shows total/free/deployed; navigates to hub; hidden for roles without `tool:read`.

### Phase 6 — E2E + hardening

- Playwright specs (`e2e/`): assign flow; over-assign blocked; stale-save conflict banner; catalog CTA deep-link; ledger drawer; Home tile navigation.
- Verify rate-limit + RLS with a non-admin session (403 / no rows).
- Accept: all E2E green; `verification-before-completion` run before claiming done.

### Dependency order

`0 → 1 → 2 → 3 → (4 ∥ start 5.1) → 5.2 → 5.3 → 6`. Phases 1 and parts of 0 can parallelize; UI (5) needs API (3) + client (4).

---

## 18. Error Handling (cross-cutting)

- **Validation errors** (400): typed reason codes from §7; surfaced inline per-field (assignment panel) or per-tool (batch). Never a generic "something went wrong" for a known invariant breach.
- **Authorization** (403): `can()` denial → audited (`permission.denied`) + generic 403 (no resource leak).
- **Conflict** (partial-apply): not an HTTP error — 200 with per-tool `status:conflict` + fresh state; UI reconciles and highlights.
- **Not found** (404): unknown `toolId`/`siteId` → 404, no detail leak.
- **DB/constraint violations**: unique (name/code) → 409 mapped from PG error code (`lib/errors/db.ts` pattern); CHECK breach → 500 only if it escapes app validation (should never — app validates first; CHECK is backstop).
- **Rate limit** (429): standard Upstash response.
- **Optimistic-update rollback**: client mutation failure reverts SWR cache to last good state and toasts the reason.
- **Idempotency**: batch-save is naturally idempotent given a matching `version` (re-submitting a committed batch → conflict, no double-apply).

---

## 19. Self-Audit

Fresh-eyes review of the spec. Findings and their resolutions (all fixed inline above unless marked accepted):

**Placeholder scan**
- Migration numbers `00XX` are intentional — actual sequence assigned at implementation against the live journal. Not a defect.
- No `TBD`/`TODO`/empty sections remain. §16 lists *defaulted* open decisions, not gaps.

**Correctness / consistency issues found & fixed**
1. **Accidental-wipe risk in batch payload.** Original §6 said `assignments` = "full desired distribution" but also marked `totalQuantity` optional — a payload sending only `totalQuantity` would, under the diff, be read as "empty desired distribution" and delete every assignment. **Fixed:** added explicit field-presence semantics (§6) — omitted `assignments` = distribution untouched; only a present array is authoritative.
2. **Orphaned assignments on site soft-delete.** Case 8 originally hooked only `archived_at`. Sites also carry `is_deleted`; a soft-delete would strip a site from active lists while its `tool_assignments` lingered (or FK-cascade-dropped them with no ledger). **Fixed:** case 8 + task 2.3 now hook both transitions and route through the return-ledger path; documented that a raw FK cascade is a backstop only.
3. **Pool-exhaustion regression risk.** Partial-apply "each tool in its own transaction" left processing model unspecified; naive parallelism would spike connection demand — a failure mode this codebase already fixed. **Fixed:** §6 now specifies sequential processing on a single pooled connection.
4. **Polymorphic ledger location undocumented.** `from/to_location` mixes keywords and site uuids; whether it FK's to `sites` was unstated (and must not, for history to survive site deletion). **Fixed:** §3.4 documents it as an intentional non-FK polymorphic string validated at write time.
5. **`transfer` kind ambiguity.** Enum listed `transfer` but §16 deferred it — could read as "implement transfer." **Fixed:** §3.4 marks it reserved/not-emitted in v1.

**Ambiguity checks**
- Concrete payload caps added (≤200 tools, ≤100 rows) — previously "max N/M".
- Assignment `qty → 0` explicitly defined as remove+return (case 17), not an invalid zero-row.
- `totalQuantity` decrease constrained to free pool (retire), never from deployed (case 2, 14).

**Scope check**
- One cohesive module (4 tables, ~11 routes, 3 UI surfaces). Large but coherent and phased (§17); each phase independently verifiable and commit-worthy. Not decomposed into separate specs — the pieces share one invariant and one data model, so splitting would fragment the core. Acceptable as a single spec with a phased plan.

**Residual accepted risks (intentional, not blocking)**
- Site→site `transfer` deferred to return+assign — acceptable; ledger still fully reconstructs movement.
- Trigram search index deferred until data volume warrants — tool counts are dozens, `ILIKE` is fine.
- Global ledger view may ship as a hub filter rather than a dedicated route.

No contradictions remain between the model (§2–3), the batch algorithm (§6), the edge-case table (§7), and the plan (§17).
