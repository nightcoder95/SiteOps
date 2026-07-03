# Tools Inventory Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (chosen: inline execution with review checkpoints) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Rigid TDD for Phases 1–2. Invoke `ui-ux-pro-max` + `frontend-ui-engineering` before Phase 5. Run `superpowers:verification-before-completion` before claiming any phase done.

**Goal:** Ship an Admin-only company tool-inventory module — catalog of tool types with fungible counts, distribution across sites with an implicit computed warehouse pool, an append-only movement ledger, race-safe partial-apply batch save, plus hub/catalog/dashboard UI.

**Architecture:** Four new tables (`tool_categories`, `tools`, `tool_assignments`, `tool_movements`). Current-state tables are authoritative; the warehouse/free pool is **computed** (`total − Σ assignments`), never stored. Every mutation writes current-state **and** ledger rows in the same transaction. Batch save processes tools **sequentially on a single pooled connection**, one short transaction per tool, giving true partial-apply without pool exhaustion. Authz via `can(role, cap)` only; five new caps, Admin-only in v1.

**Tech Stack:** Next.js 16 (App Router), drizzle-orm 0.45 + postgres.js (Supabase transaction pooler, `prepare:false`), zod 4, SWR 2, vitest 3, Playwright, Tailwind 4, `motion/react`, `sonner`, `lucide-react`.

**Spec:** `.docs/2026-07-03-tools-inventory-module-design.md` is authoritative. This plan expands its §17. Section refs below (§N) point at the spec.

---

## Conventions locked from the codebase (read before starting)

- **Repo root:** `/Volumes/work/my_projects/SiteOps/SiteOps-Web` (NOT the parent `SiteOps`). All paths below are relative to it.
- **Commands:** `npm test` (vitest run), `npm run test:watch`, `npm run lint` (`tsc --noEmit`), `npm run test:e2e` (Playwright). `db:generate` is unreliable at this drizzle-kit/journal combo — **hand-write migration SQL + v7 snapshot + journal entry** (see Task 0.2).
- **Migrations are push-managed, NOT migrate-managed** (`__drizzle_migrations` is empty on live DB). New migration SQL MUST be idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `DO $$ … $$` guards) and is applied by running the file directly against `DIRECT_URL`, never via `npm run db:migrate`. Journal is v7; each `meta/00NN_snapshot.json` needs a unique `id` and `prevId` chaining to the prior snapshot. Next number = **0024**.
- **Schema conventions** (`lib/db/schema.ts`): `identityId()` helper = `integer("id").primaryKey().generatedAlwaysAsIdentity()`; public `uuid("x_id").notNull().unique().defaultRandom()`; audit `createdByUserId`/`updatedByUserId` → `userProfiles.userId`; `createdAt`/`updatedAt` = `timestamp(...).notNull().defaultNow()`; indexes via table 3rd-arg `(t) => [ ... ]`; partial unique via `.where(sql\`...\`)`. `check` is available from `drizzle-orm/pg-core` (not yet imported).
- **Route pattern** (`app/api/catalog/units/route.ts`): `withApi` / `withApiRoute<RouteCtx>`; `const auth = await requireCapability(request, cap); if (!("session" in auth)) return errorResponse(auth.error, msg, auth.status, undefined, requestId);`; `parseJsonBody` + `validateBody(schema, ...)`; `successResponse(data, status, requestId)`; `errorResponse(code, msg, status, details, requestId)`; `handleDbError(dbError, requestId)` maps PG `23505`→409, `23503`→409, `23514`→400. `session.user.role`, `session.user.id`.
- **Route test pattern** (`app/api/catalog/units/route.test.ts`): `vi.hoisted` mocks for `requireCapability` + `db`; import `GET/POST` from `./route`; assert status codes + captured insert values. **Integration DB tests** (Phase 2) need a real DB — gate them so they skip when no `DATABASE_URL` (see Task 2.1).
- **Transactions:** `db.transaction(async (tx) => { ... })`. Row lock: `.for("update")` on a select. Raw SQL for `SET LOCAL`: `tx.execute(sql.raw("SET LOCAL statement_timeout = 15000"))` (pattern in `lib/db/guard.ts`).
- **Client fetch** (`lib/http/useApiQuery.ts`): `useApiResult<T>(key)` (envelope-preserving, never throws) and `useApiQuery<T>(key)` (throwing). Mutations via `requestJson`; after mutation call `mutate()` or `mutate(next, { revalidate: false })`.
- **RLS** (`0015_rls_policies.sql`): `ENABLE ROW LEVEL SECURITY`; authenticated read = `USING (auth.role() = 'authenticated')`; admin write = `FOR ALL USING/WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin')`. Statements separated by `--> statement-breakpoint`.
- **DO NOT** delete anything from the DB. Sites are never hard-deleted. Ledger `from/to_location` are polymorphic strings, NOT FK'd.

---

## File Structure (decomposition)

**Schema / migration**
- `lib/db/schema.ts` — MODIFY: add 4 tables + `check` import.
- `lib/db/migrations/0024_tools_inventory.sql` — CREATE: DDL + indexes + CHECKs + FK actions + RLS + category seed (idempotent).
- `lib/db/migrations/meta/0024_snapshot.json` + `_journal.json` — CREATE/MODIFY: v7 snapshot + journal entry.

**Auth**
- `lib/auth/capabilities.ts` (+ `.test.ts`) — MODIFY: 5 new caps, Admin-only.

**Domain logic (pure)**
- `lib/tools/invariant.ts` (+ `.test.ts`) — CREATE: `validateDistribution`.
- `lib/tools/code.ts` (+ `.test.ts`) — CREATE: `nextToolCode`.
- `lib/tools/diff.ts` (+ `.test.ts`) — CREATE: `diffAssignments`.
- `lib/tools/types.ts` — CREATE: shared TS types (movement kinds, statuses, reason codes).

**Server logic (transactional)**
- `lib/tools/applyBatch.ts` (+ `.test.ts` integration) — CREATE: single-tool tx apply.
- `lib/tools/manage.ts` (+ `.test.ts` integration) — CREATE: create/delete tool.
- `lib/tools/siteLifecycle.ts` (+ `.test.ts` integration) — CREATE: auto-return-on-site-archive/delete helper.
- `lib/tools/query.ts` — CREATE: list/detail/dashboard aggregate reads (computed free).

**Validation**
- `lib/validation/toolSchemas.ts` (+ `.test.ts`) — CREATE: zod schemas for all tool bodies/queries.

**API routes** (each with `route.test.ts`)
- `app/api/tools/route.ts` — GET list, POST create.
- `app/api/tools/[id]/route.ts` — GET, PATCH, DELETE.
- `app/api/tools/batch-save/route.ts` — POST partial-apply.
- `app/api/tools/[id]/movements/route.ts` — GET per-tool ledger.
- `app/api/tools/movements/route.ts` — GET global ledger.
- `app/api/tools/dashboard/route.ts` — GET aggregates.
- `app/api/tools/categories/route.ts` — GET, POST.
- `app/api/tools/categories/[id]/route.ts` — PATCH.
- MODIFY `app/api/sites/[id]/route.ts` — wire the site-lifecycle hook (Task 2.3).

**Client**
- `lib/client/tools.ts` — CREATE: `useTools`, `useToolDashboard`, `useToolMovements`, `useToolCategories` + mutation wrappers.

**UI**
- `components/catalog/CatalogAdminTabs.tsx` — MODIFY: add `Tools` tab + `?tab=` URL selection.
- `components/tools/ToolCatalogManager.tsx`, `ToolCategoryManager.tsx` — CREATE (mirror `CatalogManager`/`RowActionsMenu`).
- `app/app/tools/page.tsx` + `components/tools/ToolsHub.tsx`, `ToolRow.tsx`, `AssignmentPanel.tsx`, `ToolDashboardStrip.tsx`, `ToolLedgerDrawer.tsx` — CREATE.
- `app/app/dashboard/page.tsx` — MODIFY + `components/tools/ToolSummaryTile.tsx` — CREATE.

**E2E**
- `e2e/tools-inventory.spec.ts` — CREATE.

---

## Phase 0 — Foundations (schema + migration + seed + capabilities)

### Task 0.1: Schema — add 4 tables

**Files:**
- Modify: `lib/db/schema.ts` (add `check` to the `drizzle-orm/pg-core` import; append 4 tables after `customUnits`).

- [ ] **Step 1: Add `check` to imports**

In the `from "drizzle-orm/pg-core"` import block, add `check,` (alphabetical, before `date`).

- [ ] **Step 2: Append the four tables**

Append to `lib/db/schema.ts`:

```ts
// ── Tools Inventory (company-global fungible tool tracking) ──────────────────
// Warehouse/free pool is COMPUTED (total − Σ assignments), never stored.
export const toolCategories = pgTable(
  "tool_categories",
  {
    id: identityId(),
    categoryId: uuid("category_id").notNull().unique().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    codePrefix: varchar("code_prefix", { length: 8 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tool_categories_name_active_uidx")
      .on(sql`lower(${t.name})`)
      .where(sql`${t.isActive} = true`),
    uniqueIndex("tool_categories_code_prefix_uidx").on(t.codePrefix),
  ]
);

export const tools = pgTable(
  "tools",
  {
    id: identityId(),
    toolId: uuid("tool_id").notNull().unique().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    code: varchar("code", { length: 20 }).notNull().unique(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => toolCategories.categoryId, { onDelete: "restrict" }),
    totalQuantity: integer("total_quantity").notNull().default(0),
    icon: varchar("icon", { length: 50 }),
    version: integer("version").notNull().default(0),
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => userProfiles.userId),
    updatedByUserId: uuid("updated_by_user_id").notNull().references(() => userProfiles.userId),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tools_name_active_uidx")
      .on(sql`lower(${t.name})`)
      .where(sql`${t.isDeleted} = false`),
    index("tools_category_id_idx").on(t.categoryId),
    check("tools_total_quantity_nonneg", sql`${t.totalQuantity} >= 0`),
  ]
);

export const toolAssignments = pgTable(
  "tool_assignments",
  {
    id: identityId(),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.toolId, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.siteId, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tool_assignments_tool_site_uidx").on(t.toolId, t.siteId),
    index("tool_assignments_tool_id_idx").on(t.toolId),
    index("tool_assignments_site_id_idx").on(t.siteId),
    check("tool_assignments_quantity_pos", sql`${t.quantity} >= 1`),
  ]
);

export const toolMovements = pgTable(
  "tool_movements",
  {
    id: identityId(),
    movementId: uuid("movement_id").notNull().unique().defaultRandom(),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tools.toolId, { onDelete: "cascade" }),
    // Polymorphic location string: 'WAREHOUSE' | 'EXTERNAL' | a site uuid.
    // Intentionally NOT FK'd — ledger is append-only history that must survive
    // a site being archived/deleted. Validated at write time (§3.4, §6).
    fromLocation: varchar("from_location", { length: 64 }).notNull(),
    toLocation: varchar("to_location", { length: 64 }).notNull(),
    quantity: integer("quantity").notNull(),
    kind: varchar("kind", { length: 20 }).notNull(),
    note: varchar("note", { length: 500 }),
    actorUserId: uuid("actor_user_id").references(() => userProfiles.userId, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("tool_movements_tool_created_idx").on(t.toolId, t.createdAt.desc().nullsLast()),
    index("tool_movements_created_idx").on(t.createdAt.desc().nullsLast()),
    check("tool_movements_quantity_pos", sql`${t.quantity} >= 1`),
  ]
);
```

- [ ] **Step 3: Verify types compile**

Run: `npm run lint`
Expected: PASS (no TS errors). If `check` import unused-warns elsewhere, ignore — it is used here.

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts
git commit -m "feat(tools): add tool inventory tables to drizzle schema"
```

**Accept:** 4 tables present with all indexes, unique constraints, CHECKs, FK actions per §3; `npm run lint` clean.

---

### Task 0.2: Migration SQL + v7 snapshot + journal

**Files:**
- Create: `lib/db/migrations/0024_tools_inventory.sql`
- Create: `lib/db/migrations/meta/0024_snapshot.json`
- Modify: `lib/db/migrations/meta/_journal.json`

- [ ] **Step 1: Write the idempotent migration SQL**

Create `lib/db/migrations/0024_tools_inventory.sql`. Idempotent + txn-safe (mirrors `0020`). RLS mirrors `unit_master`/`categories` (authenticated read, admin write).

```sql
-- Tools Inventory module — 4 tables + indexes + CHECKs + FK actions + RLS +
-- category seed. Additive + idempotent (safe to apply to the push-managed live
-- DB and to re-run). No data destroyed. Applied via:
--   psql "$DIRECT_URL" -f lib/db/migrations/0024_tools_inventory.sql
BEGIN;

-- ── tool_categories ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tool_categories (
  "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL PRIMARY KEY,
  "category_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  "name" varchar(100) NOT NULL,
  "code_prefix" varchar(8) NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS tool_categories_name_active_uidx
  ON public.tool_categories (lower(name)) WHERE is_active = true;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS tool_categories_code_prefix_uidx
  ON public.tool_categories (code_prefix);
--> statement-breakpoint

-- ── tools ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tools (
  "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL PRIMARY KEY,
  "tool_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  "name" varchar(120) NOT NULL,
  "code" varchar(20) NOT NULL UNIQUE,
  "category_id" uuid NOT NULL,
  "total_quantity" integer DEFAULT 0 NOT NULL,
  "icon" varchar(50),
  "version" integer DEFAULT 0 NOT NULL,
  "is_deleted" boolean DEFAULT false NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "updated_by_user_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public.tools ADD CONSTRAINT tools_category_id_fk
    FOREIGN KEY (category_id) REFERENCES public.tool_categories(category_id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public.tools ADD CONSTRAINT tools_created_by_fk
    FOREIGN KEY (created_by_user_id) REFERENCES public.user_profiles(user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public.tools ADD CONSTRAINT tools_updated_by_fk
    FOREIGN KEY (updated_by_user_id) REFERENCES public.user_profiles(user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public.tools ADD CONSTRAINT tools_total_quantity_nonneg CHECK (total_quantity >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS tools_name_active_uidx
  ON public.tools (lower(name)) WHERE is_deleted = false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tools_category_id_idx ON public.tools (category_id);
--> statement-breakpoint

-- ── tool_assignments ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tool_assignments (
  "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL PRIMARY KEY,
  "tool_id" uuid NOT NULL,
  "site_id" uuid NOT NULL,
  "quantity" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public.tool_assignments ADD CONSTRAINT tool_assignments_tool_id_fk
    FOREIGN KEY (tool_id) REFERENCES public.tools(tool_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public.tool_assignments ADD CONSTRAINT tool_assignments_site_id_fk
    FOREIGN KEY (site_id) REFERENCES public.sites(site_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public.tool_assignments ADD CONSTRAINT tool_assignments_quantity_pos CHECK (quantity >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS tool_assignments_tool_site_uidx
  ON public.tool_assignments (tool_id, site_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tool_assignments_tool_id_idx ON public.tool_assignments (tool_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tool_assignments_site_id_idx ON public.tool_assignments (site_id);
--> statement-breakpoint

-- ── tool_movements (append-only ledger) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tool_movements (
  "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL PRIMARY KEY,
  "movement_id" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  "tool_id" uuid NOT NULL,
  "from_location" varchar(64) NOT NULL,
  "to_location" varchar(64) NOT NULL,
  "quantity" integer NOT NULL,
  "kind" varchar(20) NOT NULL,
  "note" varchar(500),
  "actor_user_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public.tool_movements ADD CONSTRAINT tool_movements_tool_id_fk
    FOREIGN KEY (tool_id) REFERENCES public.tools(tool_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public.tool_movements ADD CONSTRAINT tool_movements_actor_fk
    FOREIGN KEY (actor_user_id) REFERENCES public.user_profiles(user_id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE public.tool_movements ADD CONSTRAINT tool_movements_quantity_pos CHECK (quantity >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tool_movements_tool_created_idx
  ON public.tool_movements (tool_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tool_movements_created_idx
  ON public.tool_movements (created_at DESC);
--> statement-breakpoint

-- ── RLS: authenticated read, admin write (mirror unit_master / categories) ──
ALTER TABLE public.tool_categories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tc:select" ON public.tool_categories;
--> statement-breakpoint
CREATE POLICY "tc:select" ON public.tool_categories FOR SELECT
  USING (auth.role() = 'authenticated');
--> statement-breakpoint
DROP POLICY IF EXISTS "tc:write" ON public.tool_categories;
--> statement-breakpoint
CREATE POLICY "tc:write" ON public.tool_categories FOR ALL
  USING ((auth.jwt() ->> 'user_role') = 'Admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');
--> statement-breakpoint

ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tools:select" ON public.tools;
--> statement-breakpoint
CREATE POLICY "tools:select" ON public.tools FOR SELECT
  USING (auth.role() = 'authenticated');
--> statement-breakpoint
DROP POLICY IF EXISTS "tools:write" ON public.tools;
--> statement-breakpoint
CREATE POLICY "tools:write" ON public.tools FOR ALL
  USING ((auth.jwt() ->> 'user_role') = 'Admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');
--> statement-breakpoint

ALTER TABLE public.tool_assignments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "ta:select" ON public.tool_assignments;
--> statement-breakpoint
CREATE POLICY "ta:select" ON public.tool_assignments FOR SELECT
  USING (auth.role() = 'authenticated');
--> statement-breakpoint
DROP POLICY IF EXISTS "ta:write" ON public.tool_assignments;
--> statement-breakpoint
CREATE POLICY "ta:write" ON public.tool_assignments FOR ALL
  USING ((auth.jwt() ->> 'user_role') = 'Admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');
--> statement-breakpoint

ALTER TABLE public.tool_movements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tm:select" ON public.tool_movements;
--> statement-breakpoint
CREATE POLICY "tm:select" ON public.tool_movements FOR SELECT
  USING (auth.role() = 'authenticated');
--> statement-breakpoint
DROP POLICY IF EXISTS "tm:write" ON public.tool_movements;
--> statement-breakpoint
CREATE POLICY "tm:write" ON public.tool_movements FOR ALL
  USING ((auth.jwt() ->> 'user_role') = 'Admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin');
--> statement-breakpoint

-- ── Seed default tool categories (idempotent) ──────────────────────────────
INSERT INTO public.tool_categories (name, code_prefix, sort_order) VALUES
  ('Hand Tool', 'HND', 0),
  ('Power Tool', 'PWR', 1),
  ('Equipment', 'EQP', 2),
  ('Container', 'CNT', 3),
  ('Safety', 'SFT', 4)
ON CONFLICT (code_prefix) DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Create the v7 snapshot**

Copy `lib/db/migrations/meta/0023_snapshot.json` to `0024_snapshot.json`. Change its top-level `"id"` to a fresh UUID and `"prevId"` to `0023`'s `id`. Add the 4 new tables to the `"tables"` object matching the drizzle-generated shape (columns, composite/unique indexes, FKs, checks). If reproducing the exact drizzle snapshot shape by hand is error-prone, instead run `npx drizzle-kit generate --name tools_inventory` FIRST and, if it succeeds, use its snapshot but **replace its `.sql` with the idempotent SQL above**. If `generate` errors (known-broken at this combo), hand-edit the snapshot copy.

- [ ] **Step 3: Append the journal entry**

In `lib/db/migrations/meta/_journal.json` `entries` array, append:

```json
{
  "idx": 24,
  "version": "7",
  "when": 1783699200000,
  "tag": "0024_tools_inventory",
  "breakpoints": true
}
```

- [ ] **Step 4: Apply to a fresh/scratch DB and verify**

Apply against a disposable DB first (never prod on first run):

Run: `psql "$SCRATCH_DB_URL" -f lib/db/migrations/0024_tools_inventory.sql`
Then verify tables + RLS:
Run: `psql "$SCRATCH_DB_URL" -c "\dt public.tool_*" -c "\d public.tools" -c "SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'tool%';"`
Expected: 4 tables exist; `relrowsecurity = t` for all four; `tool_categories` has 5 seeded rows.

- [ ] **Step 5: Re-run to prove idempotency**

Run: `psql "$SCRATCH_DB_URL" -f lib/db/migrations/0024_tools_inventory.sql`
Expected: no errors; category count still 5 (ON CONFLICT DO NOTHING).

- [ ] **Step 6: Apply to a copy of prod schema**

Per `project_migration_lineage`: apply the same file against a copy of the prod schema (`$DIRECT_URL` clone) and re-run Step 4 verification. Only after both scratch + prod-copy pass is the migration trusted.

- [ ] **Step 7: Commit**

```bash
git add lib/db/migrations/0024_tools_inventory.sql lib/db/migrations/meta/0024_snapshot.json lib/db/migrations/meta/_journal.json
git commit -m "feat(tools): migration 0024 — tool inventory tables, RLS, category seed"
```

**Accept:** migration applies cleanly to fresh DB AND prod-schema copy; re-runnable; RLS enabled on all 4 tables; 5 categories seeded with prefixes (§7 case-agnostic, §15).

---

### Task 0.3: Seed verification

Covered by 0.2's seed block. No separate migration file needed.

- [ ] **Step 1:** Confirm seeded prefixes are exactly `HND/PWR/EQP/CNT/SFT` (Step 4 above).
- [ ] Client tools (Manvatti, Pikkas, …) seeding is **optional** (§15) — skip in v1; admin creates them via UI.

**Accept:** categories present with prefixes after migrate.

---

### Task 0.4: Capabilities

**Files:**
- Modify: `lib/auth/capabilities.ts`
- Create/Modify: `lib/auth/capabilities.test.ts`

- [ ] **Step 1: Write the failing test**

Create/append `lib/auth/capabilities.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { can } from "./capabilities";
import { ROLES } from "./roles";

describe("tool capabilities", () => {
  const toolCaps = ["tool:read", "tool:manage", "tool:assign", "tool:delete", "tool_category:manage"] as const;

  it("grants all five tool caps to Admin", () => {
    for (const c of toolCaps) expect(can(ROLES.ADMIN, c)).toBe(true);
  });

  it("denies all five tool caps to Supervisor", () => {
    for (const c of toolCaps) expect(can(ROLES.SUPERVISOR, c)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- capabilities`
Expected: FAIL — TS error / caps not in union.

- [ ] **Step 3: Add caps to the union + Admin set**

In `lib/auth/capabilities.ts`, add to the `Capability` union (before `"data:export";`):

```ts
  | "tool:read"
  | "tool:manage"
  | "tool:assign"
  | "tool:delete"
  | "tool_category:manage"
```

Add to `ADMIN_CAPABILITIES` (after `"data:export"` line — keep the trailing comment intact):

```ts
  // Tools inventory (v1: Admin-only; add tool:read to SUPERVISOR_CAPABILITIES
  // later to enable site-scoped supervisor read — one edit, per §9).
  "tool:read",
  "tool:manage",
  "tool:assign",
  "tool:delete",
  "tool_category:manage",
```

Do NOT touch `SUPERVISOR_CAPABILITIES`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- capabilities`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add lib/auth/capabilities.ts lib/auth/capabilities.test.ts
git commit -m "feat(tools): add tool:* capabilities (Admin-only)"
```

**Accept:** `can('Admin','tool:assign')===true`; `can('Supervisor','tool:read')===false`; exhaustive union type-checks (§9, §17 0.4).

---

## Phase 1 — Domain logic (pure, RIGID TDD)

> Invoke `superpowers:test-driven-development`. Write failing test → run (fail) → minimal impl → run (pass) → commit, per unit. These are pure functions — no DB, no mocks.

### Task 1.0: Shared types

**Files:** Create `lib/tools/types.ts`

- [ ] **Step 1: Write the types** (no test — pure type module)

```ts
export const MOVEMENT_KINDS = [
  "opening", "procure", "retire", "assign", "return", "transfer", "adjust",
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const WAREHOUSE = "WAREHOUSE";
export const EXTERNAL = "EXTERNAL";

export type DistributionErrorCode =
  | "sum_exceeds_total"
  | "total_below_assigned"
  | "duplicate_site"
  | "non_positive_qty"
  | "non_integer"
  | "negative_total";

export type ToolResultStatus = "ok" | "conflict" | "invalid";

export type InvalidReason =
  | DistributionErrorCode
  | "site_unavailable"
  | "retire_exceeds_free";

export type AssignmentInput = { siteId: string; qty: number };
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
git add lib/tools/types.ts
git commit -m "feat(tools): shared domain types"
```

### Task 1.1: Invariant validator (§7 cases 1–4, 13–14, 17; spec 1.1)

**Files:** Create `lib/tools/invariant.ts` + `lib/tools/invariant.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/tools/invariant.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateDistribution } from "./invariant";

const ok = (r: ReturnType<typeof validateDistribution>) => r.ok === true;

describe("validateDistribution", () => {
  it("accepts a valid distribution (Σ < total leaves free)", () => {
    const r = validateDistribution({ totalQuantity: 20, assignments: [{ siteId: "a", qty: 8 }, { siteId: "b", qty: 5 }] });
    expect(ok(r)).toBe(true);
  });

  it("accepts Σ === total (free = 0)", () => {
    expect(ok(validateDistribution({ totalQuantity: 10, assignments: [{ siteId: "a", qty: 10 }] }))).toBe(true);
  });

  it("accepts empty assignments", () => {
    expect(ok(validateDistribution({ totalQuantity: 5, assignments: [] }))).toBe(true);
  });

  it("rejects Σ > total → sum_exceeds_total (case 1, 13)", () => {
    const r = validateDistribution({ totalQuantity: 5, assignments: [{ siteId: "a", qty: 6 }] });
    expect(r).toEqual({ ok: false, reason: "sum_exceeds_total" });
  });

  it("rejects zero qty → non_positive_qty (case 3)", () => {
    const r = validateDistribution({ totalQuantity: 5, assignments: [{ siteId: "a", qty: 0 }] });
    expect(r).toEqual({ ok: false, reason: "non_positive_qty" });
  });

  it("rejects negative qty → non_positive_qty (case 3)", () => {
    expect(validateDistribution({ totalQuantity: 5, assignments: [{ siteId: "a", qty: -2 }] }))
      .toEqual({ ok: false, reason: "non_positive_qty" });
  });

  it("rejects fractional qty → non_integer (case 3)", () => {
    expect(validateDistribution({ totalQuantity: 5, assignments: [{ siteId: "a", qty: 1.5 }] }))
      .toEqual({ ok: false, reason: "non_integer" });
  });

  it("rejects negative total → negative_total", () => {
    expect(validateDistribution({ totalQuantity: -1, assignments: [] }))
      .toEqual({ ok: false, reason: "negative_total" });
  });

  it("rejects fractional total → non_integer", () => {
    expect(validateDistribution({ totalQuantity: 5.5, assignments: [] }))
      .toEqual({ ok: false, reason: "non_integer" });
  });

  it("rejects duplicate siteId → duplicate_site (case 4)", () => {
    expect(validateDistribution({ totalQuantity: 20, assignments: [{ siteId: "a", qty: 3 }, { siteId: "a", qty: 4 }] }))
      .toEqual({ ok: false, reason: "duplicate_site" });
  });
});
```

- [ ] **Step 2: Run — expect fail** (`npm test -- invariant`) → FAIL (module missing).

- [ ] **Step 3: Implement**

`lib/tools/invariant.ts`:

```ts
import type { AssignmentInput, DistributionErrorCode } from "./types";

export type DistributionResult =
  | { ok: true }
  | { ok: false; reason: DistributionErrorCode };

// Order of checks is deterministic: structural (integer/positivity/duplicates)
// before the aggregate invariant, so the returned reason is the most specific.
export function validateDistribution(input: {
  totalQuantity: number;
  assignments: AssignmentInput[];
}): DistributionResult {
  const { totalQuantity, assignments } = input;

  if (!Number.isInteger(totalQuantity)) return { ok: false, reason: "non_integer" };
  if (totalQuantity < 0) return { ok: false, reason: "negative_total" };

  const seen = new Set<string>();
  let sum = 0;
  for (const a of assignments) {
    if (!Number.isInteger(a.qty)) return { ok: false, reason: "non_integer" };
    if (a.qty < 1) return { ok: false, reason: "non_positive_qty" };
    if (seen.has(a.siteId)) return { ok: false, reason: "duplicate_site" };
    seen.add(a.siteId);
    sum += a.qty;
  }

  if (sum > totalQuantity) return { ok: false, reason: "sum_exceeds_total" };
  return { ok: true };
}
```

- [ ] **Step 4: Run — expect pass** (`npm test -- invariant`) → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/tools/invariant.ts lib/tools/invariant.test.ts
git commit -m "feat(tools): distribution invariant validator (TDD)"
```

> Note: `total_below_assigned` and `retire_exceeds_free` are decided against **committed DB state** (current Σ / free), not the payload alone, so they live in `applyBatch` (Task 2.1), not here. Cases 2 & 14 are covered there.

**Accept:** every branch in §7 (1–4, 13, and the structural half of 3) covered; tests green.

### Task 1.2: Code generator (§4; spec 1.2)

**Files:** Create `lib/tools/code.ts` + `lib/tools/code.test.ts`

- [ ] **Step 1: Failing test**

`lib/tools/code.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextToolCode, parseSequence } from "./code";

describe("nextToolCode", () => {
  it("starts at 001 when no existing sequences", () => {
    expect(nextToolCode("HND", [])).toBe("HND-001");
  });

  it("increments from the max existing sequence", () => {
    expect(nextToolCode("PWR", [1, 2, 3])).toBe("PWR-004");
  });

  it("is gap-tolerant: does not renumber into a gap", () => {
    expect(nextToolCode("HND", [1, 3])).toBe("HND-004"); // max(3)+1, not 2
  });

  it("zero-pads to 3 digits and grows past 999", () => {
    expect(nextToolCode("EQP", [11])).toBe("EQP-012");
    expect(nextToolCode("EQP", [999])).toBe("EQP-1000");
  });
});

describe("parseSequence", () => {
  it("extracts the numeric sequence for a matching prefix", () => {
    expect(parseSequence("HND", "HND-004")).toBe(4);
  });
  it("returns null for a non-matching prefix", () => {
    expect(parseSequence("HND", "PWR-004")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement**

`lib/tools/code.ts`:

```ts
// Parse the trailing sequence integer out of a `PREFIX-NNN` code for a given
// prefix. Returns null if the code does not belong to that prefix.
export function parseSequence(prefix: string, code: string): number | null {
  const m = new RegExp(`^${prefix}-(\\d+)$`).exec(code);
  return m ? Number(m[1]) : null;
}

// Next human-friendly code for a prefix. Gap-tolerant: uses max(existing)+1 so
// deleting a middle code never renumbers. Zero-padded to 3, grows beyond.
export function nextToolCode(prefix: string, existingSequences: number[]): string {
  const max = existingSequences.reduce((m, n) => Math.max(m, n), 0);
  const next = max + 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}
```

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: Commit**

```bash
git add lib/tools/code.ts lib/tools/code.test.ts
git commit -m "feat(tools): tool code generator, gap-tolerant (TDD)"
```

**Accept:** gaps don't renumber; increments from max; padding correct (§4, case 18 substrate).

### Task 1.3: Assignment diff (§17 1.3; cases 15, 17)

**Files:** Create `lib/tools/diff.ts` + `lib/tools/diff.test.ts`

- [ ] **Step 1: Failing test**

`lib/tools/diff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { diffAssignments } from "./diff";

describe("diffAssignments", () => {
  it("inserts a new site assignment → assign movement", () => {
    const d = diffAssignments([], [{ siteId: "a", qty: 5 }]);
    expect(d.inserts).toEqual([{ siteId: "a", qty: 5 }]);
    expect(d.updates).toEqual([]);
    expect(d.deletes).toEqual([]);
    expect(d.movements).toEqual([{ kind: "assign", siteId: "a", qty: 5 }]);
  });

  it("updates a changed qty upward → assign delta", () => {
    const d = diffAssignments([{ siteId: "a", qty: 3 }], [{ siteId: "a", qty: 8 }]);
    expect(d.updates).toEqual([{ siteId: "a", qty: 8 }]);
    expect(d.movements).toEqual([{ kind: "assign", siteId: "a", qty: 5 }]);
  });

  it("updates a changed qty downward → return delta", () => {
    const d = diffAssignments([{ siteId: "a", qty: 8 }], [{ siteId: "a", qty: 3 }]);
    expect(d.updates).toEqual([{ siteId: "a", qty: 3 }]);
    expect(d.movements).toEqual([{ kind: "return", siteId: "a", qty: 5 }]);
  });

  it("qty→0 removes the assignment + return movement (case 17)", () => {
    const d = diffAssignments([{ siteId: "a", qty: 4 }], [{ siteId: "a", qty: 0 }]);
    expect(d.deletes).toEqual(["a"]);
    expect(d.updates).toEqual([]);
    expect(d.movements).toEqual([{ kind: "return", siteId: "a", qty: 4 }]);
  });

  it("site omitted from desired → delete + full return (case 17 / §6)", () => {
    const d = diffAssignments([{ siteId: "a", qty: 4 }], []);
    expect(d.deletes).toEqual(["a"]);
    expect(d.movements).toEqual([{ kind: "return", siteId: "a", qty: 4 }]);
  });

  it("unchanged qty yields no movement", () => {
    const d = diffAssignments([{ siteId: "a", qty: 4 }], [{ siteId: "a", qty: 4 }]);
    expect(d.movements).toEqual([]);
    expect(d.inserts).toEqual([]);
    expect(d.updates).toEqual([]);
    expect(d.deletes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement**

`lib/tools/diff.ts`:

```ts
import type { AssignmentInput } from "./types";

export type AssignmentDelta = { kind: "assign" | "return"; siteId: string; qty: number };
export type AssignmentDiff = {
  inserts: AssignmentInput[];         // new (tool,site) rows, qty ≥ 1
  updates: AssignmentInput[];         // existing rows with a new qty ≥ 1
  deletes: string[];                  // siteIds whose row is removed
  movements: AssignmentDelta[];       // ledger deltas (assign for +, return for −)
};

// Pure diff of current vs desired per-site distribution. `desired` is the FULL
// authoritative distribution (a present array in §6 semantics): a site absent
// from `desired`, or present with qty 0, is a removal → return movement. The
// caller decides `desired`; passing the unchanged current array yields a no-op.
export function diffAssignments(
  current: AssignmentInput[],
  desired: AssignmentInput[],
): AssignmentDiff {
  const curMap = new Map(current.map((a) => [a.siteId, a.qty]));
  const desMap = new Map(desired.map((a) => [a.siteId, a.qty]));

  const inserts: AssignmentInput[] = [];
  const updates: AssignmentInput[] = [];
  const deletes: string[] = [];
  const movements: AssignmentDelta[] = [];

  for (const { siteId, qty } of desired) {
    const prev = curMap.get(siteId);
    if (qty === 0) {
      if (prev !== undefined) { deletes.push(siteId); movements.push({ kind: "return", siteId, qty: prev }); }
      continue;
    }
    if (prev === undefined) {
      inserts.push({ siteId, qty });
      movements.push({ kind: "assign", siteId, qty });
    } else if (qty > prev) {
      updates.push({ siteId, qty });
      movements.push({ kind: "assign", siteId, qty: qty - prev });
    } else if (qty < prev) {
      updates.push({ siteId, qty });
      movements.push({ kind: "return", siteId, qty: prev - qty });
    }
  }

  for (const { siteId, qty } of current) {
    if (!desMap.has(siteId)) {
      deletes.push(siteId);
      movements.push({ kind: "return", siteId, qty });
    }
  }

  return { inserts, updates, deletes, movements };
}
```

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: Commit**

```bash
git add lib/tools/diff.ts lib/tools/diff.test.ts
git commit -m "feat(tools): assignment diff → insert/update/delete + movements (TDD)"
```

**Accept:** qty→0 and omitted-site both yield delete + return (case 17); new site → insert+assign; up/down → assign/return deltas.

---

## Phase 2 — Server: transactional apply (integration-tested)

> These need a real DB. Add a shared test helper that skips when `DATABASE_URL` is unset, so CI without a DB still passes and a dev with a scratch DB runs them.

### Task 2.0: Integration test harness

**Files:** Create `lib/tools/testdb.ts` (test-only helper)

- [ ] **Step 1:** Add helper

```ts
import { db } from "@/lib/db/client";

// Skip integration suites when no DB is configured (CI without Postgres).
export const dbIt = process.env.DATABASE_URL ? it : it.skip;
export { db };
```

(Import `it` from vitest in each suite; re-export pattern optional — simplest is `const dbDescribe = process.env.DATABASE_URL ? describe : describe.skip;` inline. Use whichever reads cleanly.)

- [ ] Seed helper: a `createFixtures(tx)` that inserts a category, a tool, two sites, and a user profile the tests reuse. Keep it in the test file if only one suite needs it; promote to `testdb.ts` when the second suite reuses it.

- [ ] **Commit** with Task 2.1 (no standalone value).

### Task 2.1: Batch-save transaction unit (spec 2.1; §6; cases 1–6, 13–14)

**Files:** Create `lib/tools/applyBatch.ts` + `lib/tools/applyBatch.test.ts`

**Contract:**

```ts
type ToolPayload = {
  toolId: string;
  version: number;
  totalQuantity?: number;          // omitted → unchanged
  assignments?: { siteId: string; qty: number }[]; // omitted → untouched
};
type ApplyResult =
  | { toolId: string; status: "ok"; tool: FreshTool }
  | { toolId: string; status: "conflict"; tool: FreshTool }
  | { toolId: string; status: "invalid"; reason: InvalidReason; tool: FreshTool };
```

- [ ] **Step 1: Write failing integration tests** — cover: happy apply; stale version → conflict (no writes); `sum_exceeds_total`; `total_below_assigned` (case 2 — decrease total under current Σ); `retire_exceeds_free` (case 14); `duplicate_site`; `site_unavailable` (archived/deleted site, case 5); ledger rows equal deltas; version bumps exactly once; **omitted `assignments` leaves distribution intact while `totalQuantity` changes (accidental-wipe guard, §19 pitfall 1)**; **`totalQuantity` omitted leaves total unchanged**.

Key assertions (abbreviated — write them concretely against fixtures):

```ts
// accidental-wipe guard
it("procure-only payload (assignments omitted) does NOT delete assignments", async () => {
  // tool with total 10, one assignment {siteA: 4}
  const r = await applyOneTool({ toolId, version, totalQuantity: 15 }, actorId);
  expect(r.status).toBe("ok");
  expect(r.tool.totalQuantity).toBe(15);
  expect(r.tool.assignments).toEqual([{ siteId: siteA, qty: 4 }]); // untouched
  // ledger got a procure(+5), no return
});

it("decreasing total below Σ assigned rejects (case 2)", async () => {
  // total 10, assigned Σ = 8
  const r = await applyOneTool({ toolId, version, totalQuantity: 5 }, actorId);
  expect(r).toMatchObject({ status: "invalid", reason: "total_below_assigned" });
  // no writes: version unchanged, total still 10
});

it("stale version → conflict, no writes (case 6)", async () => {
  const r = await applyOneTool({ toolId, version: version - 1, totalQuantity: 99 }, actorId);
  expect(r.status).toBe("conflict");
  expect(r.tool.version).toBe(version); // unchanged
});
```

- [ ] **Step 2: Run — FAIL** (module missing).

- [ ] **Step 3: Implement `applyBatch.ts`**

Logic per §6 steps 1–6, all inside a single `db.transaction`:

```ts
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tools, toolAssignments, toolMovements, sites } from "@/lib/db/schema";
import { validateDistribution } from "./invariant";
import { diffAssignments } from "./diff";
import { WAREHOUSE, type AssignmentInput, type InvalidReason } from "./types";

export type FreshTool = {
  toolId: string; name: string; code: string; categoryId: string;
  totalQuantity: number; icon: string | null; version: number;
  assignments: AssignmentInput[];
};
export type ToolPayload = {
  toolId: string; version: number;
  totalQuantity?: number; assignments?: AssignmentInput[];
};
export type ApplyResult =
  | { toolId: string; status: "ok" | "conflict"; tool: FreshTool }
  | { toolId: string; status: "invalid"; reason: InvalidReason; tool: FreshTool };

// Apply ONE tool in its OWN transaction. Callers (batch route) invoke this
// sequentially on the single shared pool — never in parallel (§6, pool-exhaustion).
export async function applyOneTool(payload: ToolPayload, actorUserId: string): Promise<ApplyResult> {
  return db.transaction(async (tx) => {
    const locked = await tx.select().from(tools)
      .where(and(eq(tools.toolId, payload.toolId), eq(tools.isDeleted, false)))
      .for("update").limit(1);
    const tool = locked[0];
    if (!tool) {
      // Unknown/deleted tool: report as conflict with a null-ish fresh snapshot.
      throw new ToolNotFound(payload.toolId);
    }

    const current = await readAssignments(tx, payload.toolId);
    const fresh = (over: Partial<FreshTool> = {}): FreshTool => toFresh(tool, current, over);

    if (tool.version !== payload.version) {
      return { toolId: payload.toolId, status: "conflict", tool: fresh() };
    }

    // Field-presence semantics (§6): omitted → untouched.
    const nextTotal = payload.totalQuantity ?? tool.totalQuantity;
    const desired: AssignmentInput[] =
      payload.assignments ?? current.map((a) => ({ ...a }));

    // Structural + aggregate invariant on the DESIRED end-state.
    const inv = validateDistribution({ totalQuantity: nextTotal, assignments: desired.filter((a) => a.qty > 0) });
    if (!inv.ok) return { toolId: payload.toolId, status: "invalid", reason: inv.reason, tool: fresh() };

    const currentSum = current.reduce((s, a) => s + a.qty, 0);
    // case 2: decreasing total below what is currently deployed.
    if (nextTotal < currentSum && payload.assignments === undefined) {
      return { toolId: payload.toolId, status: "invalid", reason: "total_below_assigned", tool: fresh() };
    }
    // case 14: retire (total down) must come from free only. With assignments
    // present, Σ desired ≤ nextTotal already guarantees it; without, the check
    // above covers it. Guard the explicit retire path:
    if (payload.assignments === undefined && nextTotal < tool.totalQuantity) {
      const free = tool.totalQuantity - currentSum;
      if (tool.totalQuantity - nextTotal > free) {
        return { toolId: payload.toolId, status: "invalid", reason: "retire_exceeds_free", tool: fresh() };
      }
    }

    // case 5: every desired site must exist, be active, not archived, not deleted.
    if (payload.assignments) {
      const siteIds = payload.assignments.map((a) => a.siteId);
      if (siteIds.length) {
        const live = await tx.select({ siteId: sites.siteId }).from(sites)
          .where(and(inArray(sites.siteId, siteIds), sql`${sites.archivedAt} IS NULL`, eq(sites.isDeleted, false)));
        const liveSet = new Set(live.map((s) => s.siteId));
        if (siteIds.some((id) => !liveSet.has(id))) {
          return { toolId: payload.toolId, status: "invalid", reason: "site_unavailable", tool: fresh() };
        }
      }
    }

    // Apply. Diff only when assignments present; else distribution untouched.
    const diff = payload.assignments
      ? diffAssignments(current, payload.assignments)
      : { inserts: [], updates: [], deletes: [], movements: [] };

    for (const ins of diff.inserts)
      await tx.insert(toolAssignments).values({ toolId: payload.toolId, siteId: ins.siteId, quantity: ins.qty });
    for (const up of diff.updates)
      await tx.update(toolAssignments).set({ quantity: up.qty, updatedAt: new Date() })
        .where(and(eq(toolAssignments.toolId, payload.toolId), eq(toolAssignments.siteId, up.siteId)));
    if (diff.deletes.length)
      await tx.delete(toolAssignments)
        .where(and(eq(toolAssignments.toolId, payload.toolId), inArray(toolAssignments.siteId, diff.deletes)));

    // Ledger: assign/return deltas.
    for (const m of diff.movements)
      await tx.insert(toolMovements).values({
        toolId: payload.toolId,
        fromLocation: m.kind === "assign" ? WAREHOUSE : m.siteId,
        toLocation: m.kind === "assign" ? m.siteId : WAREHOUSE,
        quantity: m.qty, kind: m.kind, actorUserId,
      });

    // Ledger: total change → procure/retire.
    if (nextTotal !== tool.totalQuantity) {
      const delta = nextTotal - tool.totalQuantity;
      await tx.insert(toolMovements).values({
        toolId: payload.toolId,
        fromLocation: delta > 0 ? "EXTERNAL" : WAREHOUSE,
        toLocation: delta > 0 ? WAREHOUSE : "EXTERNAL",
        quantity: Math.abs(delta), kind: delta > 0 ? "procure" : "retire", actorUserId,
      });
    }

    const newVersion = tool.version + 1;
    await tx.update(tools)
      .set({ totalQuantity: nextTotal, version: newVersion, updatedByUserId: actorUserId, updatedAt: new Date() })
      .where(eq(tools.toolId, payload.toolId));

    const nextAssignments = await readAssignments(tx, payload.toolId);
    return { toolId: payload.toolId, status: "ok", tool: toFresh({ ...tool, totalQuantity: nextTotal, version: newVersion }, nextAssignments) };
  });
}
```

Add helpers `readAssignments(tx, toolId)`, `toFresh(toolRow, assignments, over)`, and `class ToolNotFound extends Error`. (Write them concretely — no placeholders.)

- [ ] **Step 4: Run — PASS** (`npm test -- applyBatch`, with scratch `DATABASE_URL`).

- [ ] **Step 5: Concurrency test** — two `applyOneTool` calls with the same starting version → exactly one `ok`, one `conflict` (validates `FOR UPDATE` + version). Add and pass.

- [ ] **Step 6: Commit**

```bash
git add lib/tools/applyBatch.ts lib/tools/applyBatch.test.ts lib/tools/testdb.ts
git commit -m "feat(tools): single-tool transactional apply, partial-apply core (TDD)"
```

**Accept:** happy apply; stale→conflict (no writes); invalid→no writes; ledger matches deltas; version bumps once; accidental-wipe guard holds; concurrency → one ok/one conflict (§6, §19 pitfalls 1 & 3, cases 1–6, 13–14).

### Task 2.2: Create / delete tool (spec 2.2; cases 7, 11, 15)

**Files:** Create `lib/tools/manage.ts` + `lib/tools/manage.test.ts`

- [ ] **Step 1: Failing tests** — create mints `PREFIX-NNN` under lock; opening stock > 0 writes `opening` movement + total; opening 0 writes none (case 15); **concurrent create → unique code, one retries** (case 11); delete blocked when `Σ assigned > 0` (case 7); `force` delete writes a `return` for every site then soft-deletes, one tx.

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** `createTool` and `deleteTool`:

```ts
// createTool: lock the category row (serialize sequence minting for its prefix),
// read existing codes for the prefix, nextToolCode, insert; retry ≤3 on 23505.
// If stock>0 insert an `opening` movement (EXTERNAL→WAREHOUSE) in the same tx.
export async function createTool(input: {
  name: string; categoryId: string; icon?: string | null; openingStock?: number; actorUserId: string;
}): Promise<FreshTool> { /* db.transaction; SELECT category FOR UPDATE; ... */ }

// deleteTool: soft delete. Block if Σ assigned > 0 unless force. force → for each
// assignment write a `return` movement (site→WAREHOUSE), delete the assignment
// rows, then set is_deleted=true, bump version — all one tx.
export async function deleteTool(input: {
  toolId: string; force: boolean; actorUserId: string;
}): Promise<{ ok: true } | { ok: false; reason: "deployed" }> { /* ... */ }
```

Retry loop for code race:

```ts
for (let attempt = 0; attempt < 3; attempt++) {
  try { /* insert with nextToolCode */ return fresh; }
  catch (e) { if (isUniqueViolation(e, "tools_code_key") && attempt < 2) continue; throw e; }
}
```

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit**

```bash
git add lib/tools/manage.ts lib/tools/manage.test.ts
git commit -m "feat(tools): create/delete tool with code minting + force-return (TDD)"
```

**Accept:** concurrent-create code uniqueness (case 11); deployed-tool delete blocked (case 7); force path ledgers returns; opening movement rules (case 15).

### Task 2.3: Site archive / soft-delete hook (spec 2.3; case 8, §19 pitfall 2)

**Files:** Create `lib/tools/siteLifecycle.ts` + `lib/tools/siteLifecycle.test.ts`; Modify `app/api/sites/[id]/route.ts`.

- [ ] **Step 1: Failing integration tests** — archiving a site with tool assignments zeroes them, writes `return` movements (`note='site_archived'`), increases affected tools' free, bumps their `version`; soft-deleting (`?permanent=true`) does the same with `note='site_deleted'`; a site with no assignments is a no-op.

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement the helper (takes a `tx`)**

```ts
import { and, eq } from "drizzle-orm";
import { toolAssignments, toolMovements, tools } from "@/lib/db/schema";
import { WAREHOUSE } from "./types";

type Tx = Parameters<Parameters<typeof import("@/lib/db/client").db.transaction>[0]>[0];

// Auto-return every tool assignment held by a site to the warehouse, ledgered.
// MUST run in the SAME tx that flips the site's archived_at / is_deleted, so the
// ledger always reconciles and no assignment is orphaned (case 8). The FK
// onDelete cascade is a backstop only — this is the ledgered path.
export async function returnSiteToolsOnLifecycle(
  tx: Tx, siteId: string, actorUserId: string, note: "site_archived" | "site_deleted",
): Promise<void> {
  const rows = await tx.select().from(toolAssignments).where(eq(toolAssignments.siteId, siteId));
  for (const row of rows) {
    await tx.insert(toolMovements).values({
      toolId: row.toolId, fromLocation: siteId, toLocation: WAREHOUSE,
      quantity: row.quantity, kind: "return", note, actorUserId,
    });
    await tx.delete(toolAssignments)
      .where(and(eq(toolAssignments.toolId, row.toolId), eq(toolAssignments.siteId, siteId)));
    await tx.update(tools)
      .set({ version: sql`${tools.version} + 1`, updatedAt: new Date() })
      .where(eq(tools.toolId, row.toolId));
  }
}
```

- [ ] **Step 4: Wire into `app/api/sites/[id]/route.ts` DELETE** — wrap BOTH write branches (permanent `is_deleted`, and archive `archived_at`) in `db.transaction`, calling the helper with the right note. Example for the archive branch:

```ts
await db.transaction(async (tx) => {
  await tx.update(sites).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(sites.siteId, id));
  await returnSiteToolsOnLifecycle(tx, id, auth.session.user.id, "site_archived");
});
```

And the permanent branch with `is_deleted` + `"site_deleted"`. Keep `invalidateSiteCache` after the tx.

- [ ] **Step 5: Run — PASS.** Also re-run the sites route test to confirm no regression.
- [ ] **Step 6: Commit**

```bash
git add lib/tools/siteLifecycle.ts lib/tools/siteLifecycle.test.ts app/api/sites/[id]/route.ts
git commit -m "feat(tools): auto-return tools on site archive/soft-delete, ledgered (case 8)"
```

**Accept:** archiving AND soft-deleting a site with tools each zero its assignments, write returns, increase tools' free, bump versions; ledger note set; FK cascade only a backstop.

### Task 2.4: Read/aggregate queries

**Files:** Create `lib/tools/query.ts` (+ `.test.ts` where logic warrants).

- [ ] `listTools(q?)` — single aggregate: tools LEFT JOIN assignments GROUP BY → `{ ...tool, free: total − Σ, assignments: [...] }`. No N+1. `q` filters `ILIKE` on name+code.
- [ ] `getTool(id)` — one tool + assignments.
- [ ] `dashboardAggregates()` — total tools, total quantity, Σ free, Σ deployed, per-category counts, per-site load — single grouped queries.
- [ ] **Commit**: `feat(tools): read + dashboard aggregate queries (computed free)`.

**Accept:** free computed on read via aggregate; no N+1 (§8, §14).

---

## Phase 3 — API routes

> Each route mirrors `app/api/catalog/units/route.ts` + `route.test.ts`. Guard with `can()` via `requireCapability`. Every body/query validated with zod (Task 3.0). Per route: authz denial → 403 (audited); validation → 400; happy → envelope.

### Task 3.0: zod schemas

**Files:** Create `lib/validation/toolSchemas.ts` + `.test.ts`

- [ ] Define + test: `createToolSchema` (name 1–120, categoryId uuid, icon optional ≤50, openingStock int ≥0 optional); `patchToolSchema` (name/categoryId/icon optional, `.strict()`, no quantities); `batchSaveSchema` — **`tools` array max 200; each: toolId uuid, version int ≥0, totalQuantity int ≥0 optional, assignments array max 100 optional, each `{ siteId uuid, qty int ≥0 }`** (qty 0 allowed = remove; §6, case 12); `createCategorySchema` (name, codePrefix 1–8 uppercased); `patchCategorySchema`; ledger query schemas (pagination, filters). Cover the caps (200/100) with a failing-length test → 400 (case 12).
- [ ] **Commit**: `feat(tools): zod schemas for tool routes`.

### Task 3.1: `app/api/tools/route.ts` — GET list, POST create

- [ ] **Step 1: Write `route.test.ts`** (mirror units test): GET requires `tool:read` (403 when denied), returns list with `free`; POST requires `tool:manage`, 400 on invalid body, 201 with minted code, 409 on duplicate name (`handleDbError`).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** GET (`requireCapability(request,"tool:read")` → `listTools(q)`) + POST (`"tool:manage"` → `validateBody(createToolSchema)` → `createTool(...)`; wrap in try/catch → `handleDbError`).
- [ ] **Step 4: Run — PASS. Step 5: Commit** `feat(tools): GET/POST /api/tools`.

### Task 3.2: `app/api/tools/[id]/route.ts` — GET, PATCH, DELETE

- [ ] Test + implement: GET (`tool:read`, 404 unknown); PATCH (`tool:manage`, `patchToolSchema`, edits name/category/icon only, 409 dup name); DELETE (`tool:delete`, `?force=true`, 409/blocked when deployed and not forced → map `deleteTool` `{ok:false,reason:"deployed"}` to a 409 with a clear message; case 7).
- [ ] **Commit** `feat(tools): GET/PATCH/DELETE /api/tools/[id]`.

### Task 3.3: `app/api/tools/batch-save/route.ts` — POST partial-apply (§6)

- [ ] **Step 1: Test** — `tool:assign` required; oversized payload → 400 (case 12); mixed result body: `ok` + `conflict` + `invalid` in one response, each carrying fresh `tool`; **good tools commit even when a sibling is invalid** (mock `applyOneTool` per-tool). Empty payload → 200 empty results (case 20).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** — `validateBody(batchSaveSchema)`; **loop tools SEQUENTIALLY** (`for … of`, `await applyOneTool` one at a time — NO `Promise.all`; §6 pool-exhaustion); collect results; catch `ToolNotFound` per-tool → push a `conflict`/`invalid` with reason `not_found`; return `{ results }`. Comment the sequential requirement loudly.
- [ ] **Step 4: Run — PASS. Step 5: Commit** `feat(tools): POST /api/tools/batch-save sequential partial-apply`.

### Task 3.4: Ledger routes

- [ ] `app/api/tools/[id]/movements/route.ts` — GET `tool:read`, paginated per-tool timeline (`tool_movements` where tool_id, order created_at desc, limit/offset).
- [ ] `app/api/tools/movements/route.ts` — GET `tool:read`, global feed with filters (tool, site → `from_location`/`to_location` match, kind, date range), paginated.
- [ ] Test both (authz + shape). **Commit** `feat(tools): tool movement ledger routes`.

### Task 3.5: `app/api/tools/dashboard/route.ts` — GET aggregates

- [ ] Test + implement `tool:read` → `dashboardAggregates()`. **Commit** `feat(tools): GET /api/tools/dashboard`.

### Task 3.6: Category routes

- [ ] `app/api/tools/categories/route.ts` — GET `tool:read` (list), POST `tool_category:manage` (`createCategorySchema`; 409 dup name/prefix).
- [ ] `app/api/tools/categories/[id]/route.ts` — PATCH `tool_category:manage` (rename/prefix/(de)activate/reorder). **Category delete not exposed**; deactivate only (case 9). If a DELETE is added later it must be FK-restrict-guarded → 409 when referenced.
- [ ] Test + implement. **Commit** `feat(tools): tool category routes`.

**Accept (Phase 3):** every route: authz denial audited + 403; validation → 400; happy → envelope; `route.test.ts` per route green; batch loop is sequential (grep the route for `Promise.all` → none).

---

## Phase 4 — Client data layer (parallelizable with 5.1)

**Files:** Create `lib/client/tools.ts`

- [ ] `useTools(q?)` — `useApiResult<{ tools: FreshTool[] }>(\`/api/tools${q ? \`?q=\${encodeURIComponent(q)}\` : ""}\`)`.
- [ ] `useToolDashboard()` — `useApiResult('/api/tools/dashboard')`.
- [ ] `useToolMovements(toolId | filters)` — keyed conditionally (`null` to skip).
- [ ] `useToolCategories()` — `useApiResult('/api/tools/categories')`.
- [ ] Mutations via `requestJson`: `saveBatch(payload)`, `createTool`, `deleteTool`, `createCategory`, `updateCategory`. After success `mutate()` the affected keys. **Conflict reconciliation:** batch-save returns fresh `tool` per result — write returned fresh state into the `useTools` cache (`mutate(next, { revalidate: false })`) so `conflict`/`invalid` tools re-render with server values (§11, §6).
- [ ] **Test** (light): a conflict result updates the cache to the fresh version (unit-test the reconcile reducer if extracted).
- [ ] **Commit** `feat(tools): client hooks + mutation wrappers`.

**Accept:** hooks typed; conflict result reconciles cache to fresh version.

---

## Phase 5 — UI

> BEFORE starting: invoke `ui-ux-pro-max` (design the hub, rows, assignment panel, dashboard strip, ledger drawer, tile, catalog tables) and `frontend-ui-engineering` (production components). Spec §12 defers pixel design to these skills — this plan fixes **structure, states, and behavior**, not visuals. Mirror `CatalogManager`/`RowActionsMenu`/`CatalogAdminTabs` idioms (Tailwind tokens like `bg-primary`, `text-on-surface-variant`; `motion/react`; `sonner` toasts).

### Task 5.1: Catalog Tools sub-tab (spec 5.1; case 9)

**Files:** Modify `components/catalog/CatalogAdminTabs.tsx`; Create `components/tools/ToolCatalogManager.tsx`, `components/tools/ToolCategoryManager.tsx`.

- [ ] **CatalogAdminTabs:** add `"Tools"` to `TABS`; add `?tab=` URL selection. Read initial tab from `useSearchParams()` (`tab=tools` → `"Tools"`), and on tab change `router.replace` with the param (preserve existing local-state UX). Wrap `useSearchParams` usage per Next 16 (Suspense boundary or `"use client"` page already provides it).

```tsx
const TABS = ["Operations", "Units", "Tools"] as const;
const paramToTab: Record<string, (typeof TABS)[number]> = { operations: "Operations", units: "Units", tools: "Tools" };
// initial: paramToTab[searchParams.get("tab") ?? ""] ?? "Operations"
// onClick: setTab(t); router.replace(`?tab=${t.toLowerCase()}`, { scroll: false });
// render: tab === "Tools" ? <ToolCatalogManager /> ... with a nested Tools/Categories switch
```

- [ ] **ToolCatalogManager:** table of tools (name, code, category, total) with `RowActionsMenu`-style edit/delete; create form (name + category → auto-code + optional opening stock). Uses `useTools`, `useToolCategories`, `createTool`, `deleteTool`. Delete-when-deployed surfaces the 409 message inline. `ToolCategoryManager`: create/rename/(de)activate/reorder/prefix; **category delete blocked when referenced** → show the guard message (case 9).
- [ ] **Accept:** CRUD works; `?tab=tools` deep-link selects the tab; category-delete-when-referenced blocked with message.
- [ ] **Commit** `feat(tools): catalog Tools sub-tab + tool/category managers`.

### Task 5.2: Operational hub (spec 5.2)

**Files:** Create `app/app/tools/page.tsx`, `components/tools/ToolsHub.tsx`, `ToolRow.tsx`, `AssignmentPanel.tsx`, `ToolDashboardStrip.tsx`, `ToolLedgerDrawer.tsx`.

- [ ] `page.tsx` — server component gating on `can(role,'tool:read')`; renders `<ToolsHub/>`. 403/redirect for roles without the cap.
- [ ] `ToolsHub` — debounced search; `ToolDashboardStrip` (from `useToolDashboard`); list of `ToolRow`; single **Save Changes** collecting per-tool dirty payloads → `saveBatch`; on response apply `ok`, re-render `conflict`/`invalid` with highlight + inline reason; empty state (no tools → "Add in catalog" CTA to `/app/admin/catalog?tab=tools`); loading skeletons; error toasts (`sonner`); offline/PWA aware.
- [ ] `ToolRow` — icon, name, code, category tag, total, **free badge**, expandable `AssignmentPanel`, per-tool dirty indicator.
- [ ] `AssignmentPanel` — steppers per assigned site + "add another site" row; qty 0 = remove; over-assign blocked inline (client mirror of invariant → disable Save / show reason before server round-trip); builds the `assignments` array (present = authoritative) and/or `totalQuantity`.
- [ ] `ToolLedgerDrawer` — opens per tool; `useToolMovements(toolId)` paginated timeline.
- [ ] **Accept:** assign flow works; over-assign blocked inline; conflict banner on stale save; ledger drawer opens.
- [ ] **Commit** `feat(tools): operational hub — rows, assignment panel, dashboard strip, ledger drawer`.

### Task 5.3: Home tile (spec 5.3)

**Files:** Modify `app/app/dashboard/page.tsx`; Create `components/tools/ToolSummaryTile.tsx`.

- [ ] `ToolSummaryTile` — compact card: total tools · free · deployed (`useToolDashboard`); links to `/app/tools`. Rendered only when `can(role,'tool:read')`.
- [ ] Wire into dashboard page behind the cap check.
- [ ] **Accept:** tile shows total/free/deployed; navigates to hub; hidden for roles without `tool:read`.
- [ ] **Commit** `feat(tools): home dashboard tool summary tile`.

---

## Phase 6 — E2E + hardening

**Files:** Create `e2e/tools-inventory.spec.ts`.

- [ ] Playwright specs: assign flow end-to-end; over-assign blocked with message; conflict banner on stale save (two-tab / stale-version simulation); catalog CTA deep-link lands on Tools sub-tab (`?tab=tools`); ledger drawer shows movements; Home tile → hub navigation.
- [ ] RLS/authz check: a non-admin (Supervisor) session gets 403 on write routes and (v1) no tool UI surfaces. Verify via API call in the spec or an integration test.
- [ ] Run: `npm run test:e2e` → all green.
- [ ] Run full suite: `npm test` (unit + integration) + `npm run lint`.
- [ ] Invoke `superpowers:verification-before-completion` — show command output for: `npm test`, `npm run lint`, `npm run test:e2e`, migration idempotency re-run.
- [ ] **Commit** `test(tools): e2e coverage for tool inventory`.

**Accept:** all E2E green; full suite green with output shown; every §7 case backed by a test/guard (map below); verification-before-completion run.

---

## §7 Edge-case → coverage map (all 20)

| # | Covered by |
|---|---|
| 1 Σ>total | 1.1 test + 2.1 test (`sum_exceeds_total`) |
| 2 total below Σ | 2.1 test (`total_below_assigned`) |
| 3 neg/zero/frac qty | 1.1 tests + zod (3.0) + CHECK (0.2) |
| 4 duplicate site | 1.1 test + zod |
| 5 site archived/deleted mid-flight | 2.1 test (`site_unavailable`) |
| 6 concurrent edit | 2.1 concurrency test (`FOR UPDATE` + version) |
| 7 delete deployed tool | 2.2 + 3.2 test (block / force) |
| 8 site archived OR soft-deleted | 2.3 tests (both transitions) |
| 9 delete/deactivate category referenced | 3.6 + 5.1 (deactivate only, FK restrict) |
| 10 duplicate tool name | unique index (0.1/0.2) → 409 (3.1 test) |
| 11 dup code concurrent | 2.2 retry test |
| 12 oversized batch | 3.0 zod caps test → 400 |
| 13 assign when free=0 | = case 1, 1.1/2.1 |
| 14 retire > free | 2.1 test (`retire_exceeds_free`) |
| 15 opening stock on create | 2.2 test (movement if >0) |
| 16 tool w/ no category | FK restrict (0.2) — impossible |
| 17 qty→0 | 1.3 + 2.1 tests (remove + return) |
| 18 rename prefix after mint | code frozen in `code` col (0.1) — 1.2 substrate |
| 19 ledger vs state divergence | same-tx writes (2.1/2.3) + `adjust` kind |
| 20 empty payload | 3.3 test (200 empty results) |

## §19 pitfalls guarded

1. **Accidental wipe** — omitted `assignments` ≠ empty; 2.1 uses `payload.assignments === undefined → untouched`; explicit test.
2. **Orphaned assignments** — 2.3 hooks BOTH `archived_at` and `is_deleted`; FK cascade backstop only.
3. **Pool exhaustion** — batch route loops sequentially (3.3); `applyOneTool` = one short tx; never `Promise.all`.
4. **Polymorphic ledger** — `from/to_location` varchar, not FK'd; validated at write time (0.1 comment + 2.1).
5. **`transfer` reserved** — in enum/types, never emitted; site→site = return+assign.

---

## Self-Review (against spec, fresh eyes)

- **Spec coverage:** §2 invariant → 1.1 + 2.1; §3 schema → 0.1/0.2; §4 code → 1.2/2.2; §6 batch → 2.1/3.3; §7 all 20 → map above; §8 routes → 3.1–3.6; §9 caps+RLS → 0.4/0.2; §10 ledger/dashboard → 2.4/3.4/3.5; §11 client → 4; §12 UI → 5; §13 tests → woven; §14 perf → 2.4 aggregates; §15 migration/seed → 0.2/0.3; §17 phases → 1:1. No gap found.
- **Placeholder scan:** domain-logic tasks (0,1,2,3) carry complete code. UI tasks (5) intentionally specify structure/behavior/acceptance and defer visuals to `ui-ux-pro-max`/`frontend-ui-engineering` per spec §12 — this is a spec-mandated deferral, not a placeholder. `query.ts`/`manage.ts` helper bodies are described precisely enough to implement TDD-first; expand to full code at execution.
- **Type consistency:** `FreshTool`, `ToolPayload`, `ApplyResult`, `AssignmentInput`, `AssignmentDelta`, `MovementKind`, `InvalidReason` are defined once (1.0/2.1) and reused. `validateDistribution` / `diffAssignments` / `nextToolCode` signatures match their call sites in 2.1/2.2.
- **Migration number:** 0024 confirmed against `_journal.json` (last = 0023).

---

## Execution note

Dependency order: `0 → 1 → 2 → 3 → (4 ∥ 5.1) → 5.2 → 5.3 → 6`. One phase at a time; each phase independently verifiable + commit-worthy; do not start a phase until the prior phase's acceptance criteria are green. Run `superpowers:verification-before-completion` before claiming ANY phase done. On merge, use `superpowers:finishing-a-development-branch`.
