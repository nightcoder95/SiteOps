# SiteOps Bug & UX Batch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six batched fixes — supervisor display names, site edit/archive/restore + tenant purge, catalog seed gaps, a dead chevron, removal of the backdate limit, and a role-visibility audit.

**Architecture:** Next.js 15 App Router + Drizzle/Postgres (Supabase) + Zod validation + capability-based RBAC (`lib/auth/capabilities.ts`). Mutating routes use `requireCapability`; destructive admin ops add a stateful `getActorRoleFromDb` re-check and `scheduleAudit`. Tests run on Vitest.

**Tech Stack:** TypeScript, Next.js 15, React 19, Drizzle ORM, Zod 4, Vitest, Tailwind, lucide-react, motion.

**Reference spec:** `.docs/2026-06-12-siteops-bugfix-ux-batch-design.md`

**Conventions:**
- Tests: `npm test` (vitest). Lint/typecheck: `npm run lint` (tsc).
- Schema column changes: edit `lib/db/schema.ts`, then `npm run db:generate` to emit a numbered migration, then `npm run db:migrate`.
- Seed/data migrations: hand-write a numbered SQL file in `lib/db/migrations/` following the `0009_seed_default_catalog.sql` pattern (idempotent), and add it to `lib/db/migrations/meta/_journal.json` the same way `db:generate` would (or run `db:generate` after editing schema and append the seed SQL to a fresh empty migration). Prefer hand-written SQL appended after the generated DDL file for that step.
- Commit after each task.

---

## WI-1 — Supervisor display name

**Files:**
- Create: `lib/users/displayName.ts`
- Create: `lib/users/displayName.test.ts`
- Modify: `lib/db/schema.ts` (add `fullName`)
- Modify: `app/api/users/me/route.ts` (accept `fullName`)
- Modify: `app/app/profile/page.tsx` (Full name input + type)
- Modify: `app/app/sites/new/page.tsx` (fetch + email merge + map)
- Modify: `app/app/sites/new/SitesNewPageClient.tsx` (render displayName)

### Task 1.1: Display-name helper (TDD)

- [ ] **Step 1: Write the failing test**

Create `lib/users/displayName.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { displayName } from "./displayName";

describe("displayName", () => {
  it("prefers explicit fullName", () => {
    expect(displayName({ fullName: "Lalit Sharma", designation: "PM" }, "x@y.com")).toBe("Lalit Sharma");
  });

  it("derives a title-cased name from the email local-part", () => {
    expect(displayName({ fullName: null, designation: null }, "lalit.sharma@procurie.com")).toBe("Lalit Sharma");
    expect(displayName({ fullName: null, designation: null }, "john_doe@x.com")).toBe("John Doe");
    expect(displayName({ fullName: null, designation: null }, "mary-jane+tag@x.com")).toBe("Mary Jane");
  });

  it("falls back to designation when no name and no email", () => {
    expect(displayName({ fullName: null, designation: "Site Lead" }, null)).toBe("Site Lead");
  });

  it("falls back to the email when local-part is unusable", () => {
    expect(displayName({ fullName: null, designation: null }, "x@y.com")).toBe("X");
  });

  it("falls back to a short id when nothing else is available", () => {
    expect(displayName({ fullName: null, designation: null }, null, "abcdef12-0000")).toBe("abcdef12");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- displayName`
Expected: FAIL ("Cannot find module './displayName'").

- [ ] **Step 3: Write minimal implementation**

Create `lib/users/displayName.ts`:

```ts
type NameParts = { fullName: string | null; designation: string | null };

function titleCase(part: string): string {
  return part
    .split(/[.\-_+]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Human label for a supervisor/user: fullName → email-derived → designation → email → short id. */
export function displayName(parts: NameParts, email: string | null, userId?: string): string {
  if (parts.fullName && parts.fullName.trim()) return parts.fullName.trim();

  if (email && email.includes("@")) {
    const local = email.slice(0, email.indexOf("@"));
    const cased = titleCase(local);
    if (cased) return cased;
  }

  if (parts.designation && parts.designation.trim()) return parts.designation.trim();
  if (email) return email;
  return (userId ?? "").slice(0, 8) || "Unknown";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- displayName`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/users/displayName.ts lib/users/displayName.test.ts
git commit -m "feat(users): add displayName helper deriving names from email"
```

### Task 1.2: Add `fullName` column

- [ ] **Step 1: Edit schema** — in `lib/db/schema.ts`, in `userProfiles`, add after `designation`:

```ts
  fullName: varchar("full_name", { length: 120 }),
```

- [ ] **Step 2: Generate migration**

Run: `npm run db:generate`
Expected: a new `lib/db/migrations/0017_*.sql` adding `full_name`.

- [ ] **Step 3: Apply migration**

Run: `npm run db:migrate`
Expected: applies cleanly.

- [ ] **Step 4: Typecheck**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations
git commit -m "feat(db): add user_profiles.full_name"
```

### Task 1.3: Accept `fullName` in profile PATCH

- [ ] **Step 1:** In `app/api/users/me/route.ts`, add to `updateProfileSchema`:

```ts
    fullName: z.string().max(120).optional(),
```

- [ ] **Step 2:** In the PATCH handler, compute and persist it alongside the others:

```ts
    const nextFullName = validation.data.fullName ?? current?.fullName ?? null;
```

Add `fullName: nextFullName,` to both the `.values({...})` insert and the `.onConflictDoUpdate({ set: {...} })` object.

- [ ] **Step 3: Typecheck**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/users/me/route.ts
git commit -m "feat(api): persist fullName on profile update"
```

### Task 1.4: Profile UI — Full name field

- [ ] **Step 1:** In `app/app/profile/page.tsx`, extend `ProfileResponse.profile` type with `fullName: string | null;`.

- [ ] **Step 2:** In `update()`, read and include it:

```ts
    const fullName = String(fd.get('fullName') ?? '').trim();
    if (fullName) payload.fullName = fullName;
```

- [ ] **Step 3:** Add a Full name input as the first field of the Update Profile form (above Phone):

```tsx
        <div className="flex flex-col gap-2">
          <label htmlFor="fullName" className={labelClass}>Full Name</label>
          <input id="fullName" name="fullName" defaultValue={profile?.fullName ?? ''} maxLength={120} className={inputClass} />
        </div>
```

- [ ] **Step 4:** Add a `ReadOnlyRow label="Name" value={profile?.fullName ?? '—'}` to the Account Details section.

- [ ] **Step 5: Typecheck & commit**

Run: `npm run lint` (Expected: PASS)

```bash
git add app/app/profile/page.tsx
git commit -m "feat(profile): optional full name field"
```

### Task 1.5: Supervisor dropdown shows names

- [ ] **Step 1:** In `app/app/sites/new/page.tsx`, replace the supervisor fetch block with one that selects `fullName`/`designation` and merges Supabase emails, mapping to `{ userId, displayName }`:

```ts
import { createSupabaseServiceClient } from "@/lib/auth/config";
import { displayName } from "@/lib/users/displayName";
// ...
  let supervisors: { userId: string; displayName: string }[] = [];
  if (can(session.user.role, "resource:manage_all")) {
    const rows = await db
      .select({
        userId: userProfiles.userId,
        fullName: userProfiles.fullName,
        designation: userProfiles.designation,
      })
      .from(userProfiles)
      .where(eq(userProfiles.role, "Supervisor"));

    const emailById = new Map<string, string>();
    try {
      const supabase = createSupabaseServiceClient();
      const perPage = 1000;
      for (let page = 1; ; page += 1) {
        const { data } = await supabase.auth.admin.listUsers({ page, perPage });
        const batch = data?.users ?? [];
        for (const u of batch) if (u.id && u.email) emailById.set(u.id, u.email);
        if (batch.length < perPage) break;
      }
    } catch {
      // email enrichment is best-effort
    }

    supervisors = rows.map((r) => ({
      userId: r.userId,
      displayName: displayName(
        { fullName: r.fullName, designation: r.designation },
        emailById.get(r.userId) ?? null,
        r.userId,
      ),
    }));
  }
```

- [ ] **Step 2:** In `SitesNewPageClient.tsx`, change the `Supervisor` type to `{ userId: string; displayName: string }` and the option render to `{s.displayName}`.

- [ ] **Step 3: Typecheck**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/app/sites/new/page.tsx app/app/sites/new/SitesNewPageClient.tsx
git commit -m "feat(sites): supervisor dropdown shows display names, not UUIDs"
```

---

## WI-4 — Clickable chevron (small, do early)

**Files:**
- Modify: `components/logs/CategoryPicker.tsx:185-223`

### Task 4.1: Wire the chevron to onSelect

- [ ] **Step 1:** In `CategoryPicker.tsx`, move the trailing chevron into a button that calls `onSelect(c)`. Replace the chevron `<div>` (lines ~219-221) with:

```tsx
              <button
                type="button"
                onClick={() => onSelect(c)}
                aria-label={`Open ${c.name}`}
                className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-600 hover:bg-sky-500 hover:text-slate-950 transition-all"
              >
                <ChevronRight className="w-5 h-5 transition-transform hover:translate-x-0.5" />
              </button>
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`, open `/app/logs/new`, pick a site, click the right arrow on a category row.
Expected: navigates into the category (same as clicking the label). Verify the site-picker chevron in `LogsNewPageClient.tsx` already works (its whole row is a `<button>`) — no change needed.

- [ ] **Step 3: Typecheck & commit**

Run: `npm run lint` (Expected: PASS)

```bash
git add components/logs/CategoryPicker.tsx
git commit -m "fix(logs): make category row chevron clickable"
```

---

## WI-5 — Remove backdate limit

**Files:**
- Modify: `lib/validation/schemas.ts:71-81`
- Modify: `lib/validation/schemas.test.ts` (adjust expectations)
- Modify: `lib/validation/constants.ts` (drop `MAX_BACKDATE_DAYS` if unused)

### Task 5.1: Allow unlimited past dates (TDD)

- [ ] **Step 1: Write/adjust the failing test** — in `lib/validation/schemas.test.ts`, add:

```ts
import { entryDateSchema } from "@/lib/validation/schemas";

describe("entryDateSchema", () => {
  const today = new Date().toISOString().slice(0, 10);
  const farPast = "2020-01-01";
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  it("accepts today", () => {
    expect(entryDateSchema.safeParse(today).success).toBe(true);
  });
  it("accepts dates far in the past", () => {
    expect(entryDateSchema.safeParse(farPast).success).toBe(true);
  });
  it("rejects future dates", () => {
    expect(entryDateSchema.safeParse(tomorrow).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- schemas`
Expected: the "far in the past" case FAILS under the current 7-day rule.

- [ ] **Step 3: Implement** — replace `entryDateSchema` in `lib/validation/schemas.ts`:

```ts
export const entryDateSchema = z.string().date().refine(
  (d) => {
    // No-future guard only; backdating is unlimited.
    const todayUtc = new Date().toISOString().slice(0, 10);
    return d <= todayUtc;
  },
  { message: "Entry date cannot be in the future" }
);
```

Remove the now-unused `import { MAX_BACKDATE_DAYS } from "@/lib/validation/constants";` line.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- schemas`
Expected: PASS.

- [ ] **Step 5: Clean the constant** — `grep -rn "MAX_BACKDATE_DAYS" .` (excluding node_modules). If only `constants.ts` remains, delete that line from `lib/validation/constants.ts`. If referenced elsewhere, leave it.

- [ ] **Step 6: Full test + lint**

Run: `npm test -- schemas && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/validation/schemas.ts lib/validation/schemas.test.ts lib/validation/constants.ts
git commit -m "feat(entries): allow unlimited backdated entries, keep no-future rule"
```

> Note: entry date `<input type="date">` pickers have no `min` restriction today, so no client change is required. Confirm during manual QA that the operation date picker accepts old dates.

---

## WI-3 — Catalog seed gaps

**Files:**
- Create: `lib/db/migrations/0018_seed_unit_master.sql` (hand-written, idempotent)
- Create: `lib/db/migrations/0019_topup_default_catalog.sql` (hand-written, idempotent)
- Modify: `lib/db/migrations/meta/_journal.json` (register both)

> The two migrations are pure data seeds (no schema change), so hand-write them following `0009_seed_default_catalog.sql`. After creating each `.sql`, append its journal entry to `meta/_journal.json` (copy the structure of the last entry, increment `idx`, set `tag` to the filename without extension, and a current `when` epoch-ms). Verify by running `npm run db:migrate`.

### Task 3.1: Seed `unit_master`

- [ ] **Step 1:** Create `lib/db/migrations/0018_seed_unit_master.sql`:

```sql
-- Seed standard construction units into unit_master. Idempotent per-row.
INSERT INTO public.unit_master (code, label, category) VALUES
  ('nos',   'Nos',          'count'),
  ('unit',  'Unit',         'count'),
  ('kg',    'Kilogram',     'weight'),
  ('ton',   'Tonne',        'weight'),
  ('bag',   'Bag',          'weight'),
  ('quintal','Quintal',     'weight'),
  ('l',     'Litre',        'volume'),
  ('m3',    'Cubic Metre',  'volume'),
  ('cft',   'Cubic Foot',   'volume'),
  ('brass', 'Brass',        'volume'),
  ('m',     'Metre',        'length'),
  ('ft',    'Foot',         'length'),
  ('mm',    'Millimetre',   'length'),
  ('inch',  'Inch',         'length'),
  ('sqm',   'Square Metre', 'area'),
  ('sqft',  'Square Foot',  'area')
ON CONFLICT (code) DO NOTHING;
```

- [ ] **Step 2:** Register in `meta/_journal.json` (new entry, `tag: "0018_seed_unit_master"`).

- [ ] **Step 3: Apply**

Run: `npm run db:migrate`
Expected: applies; `unit_master` now has 16 rows.

- [ ] **Step 4: Verify the endpoint**

Run: `npm run dev`, hit `/api/catalog/units/master` while signed in (or open a material log form).
Expected: unit dropdown is populated.

- [ ] **Step 5: Commit**

```bash
git add lib/db/migrations/0018_seed_unit_master.sql lib/db/migrations/meta/_journal.json
git commit -m "feat(catalog): seed unit_master with standard units"
```

### Task 3.2: Top-up default categories/subcategories

- [ ] **Step 1:** Create `lib/db/migrations/0019_topup_default_catalog.sql` that inserts each default category and subcategory per-row with `ON CONFLICT DO NOTHING`, so DBs seeded before changes converge (mirror `DEFAULT_CATEGORY_CATALOG` in `lib/db/defaultCatalog.ts`):

```sql
-- Per-row top-up of default categories/subcategories. Idempotent; safe on
-- already-seeded DBs (unlike the all-or-nothing 0009 guard).
INSERT INTO public.categories (name) VALUES
  ('Labour'), ('Materials'), ('Machinery/Equipment'), ('Expenses')
ON CONFLICT (name) DO NOTHING;

-- Subcategories: insert by resolving the parent category_id by name.
INSERT INTO public.subcategories (category_id, name)
SELECT c.category_id, s.name
FROM (VALUES
  ('Labour','Steel work'), ('Labour','Shuttering'), ('Labour','Brick work'),
  ('Labour','Concrete work'), ('Labour','Plastering'), ('Labour','Electric work'),
  ('Labour','Plumbing'), ('Labour','Tile work'), ('Labour','Wood work'), ('Labour','Paint work'),
  ('Materials','Cement'), ('Materials','M sand'), ('Materials','P sand'), ('Materials','Metal'),
  ('Materials','Steel'), ('Materials','Red Brick'), ('Materials','Cement Block 6in'), ('Materials','Cement Block 4in'),
  ('Machinery/Equipment','Excavator'), ('Machinery/Equipment','Concrete Mixer'),
  ('Machinery/Equipment','Crane'), ('Machinery/Equipment','Vibrator'), ('Machinery/Equipment','Generator'),
  ('Expenses','Transport'), ('Expenses','Food'), ('Expenses','Misc')
) AS s(cat, name)
JOIN public.categories c ON c.name = s.cat
WHERE NOT EXISTS (
  SELECT 1 FROM public.subcategories sub
  WHERE sub.category_id = c.category_id AND sub.name = s.name
);
```

- [ ] **Step 2:** Register in `meta/_journal.json` (`tag: "0019_topup_default_catalog"`).

- [ ] **Step 3: Apply & verify**

Run: `npm run db:migrate`
Expected: applies; every default category has its full subcategory set.

- [ ] **Step 4:** Confirm machinery options resolution — open a machinery log form and confirm the type dropdown lists the default machinery options. If the form reads only `custom_machinery_types` (not subcategories), add a per-row `ON CONFLICT DO NOTHING` seed of the five default machinery types into `custom_machinery_types` in this same migration (each needs `created_by_user_id`/`updated_by_user_id` — use the first admin's `user_id` via subquery, or skip seeding custom types and confirm the form falls back to the `machinery_default_type` enum). Decide based on what `components/logs/*` machinery form actually queries; document the decision in the commit body.

- [ ] **Step 5: Commit**

```bash
git add lib/db/migrations/0019_topup_default_catalog.sql lib/db/migrations/meta/_journal.json
git commit -m "feat(catalog): per-row top-up of default categories/subcategories"
```

---

## WI-2 — Edit / archive / restore / purge

**Files:**
- Modify: `lib/db/schema.ts` (add `isDeleted`, swap unique→partial index)
- Modify/Create: migration for the above (`db:generate`)
- Modify: `app/api/sites/[id]/route.ts` (permanent flag on DELETE; exclude `isDeleted`)
- Create: `app/api/sites/[id]/restore/route.ts`
- Create: `app/api/admin/purge/route.ts`
- Modify: `app/api/sites/route.ts` + `lib/services/dashboard.ts` (exclude `isDeleted`; add archived list for admin)
- Create: `app/app/sites/[id]/EditSiteModal.tsx`
- Modify: `app/app/sites/[id]/SiteDetailPageClient.tsx` (Edit button + redesigned delete; pass supervisors)
- Modify: `app/app/sites/[id]/page.tsx` (pass supervisors list to client when admin)
- Modify: `app/app/dashboard/DashboardPageClient.tsx` (admin Archived Sites section)
- Modify: `app/app/dashboard/page.tsx` + `lib/services/dashboard.ts` (return archived sites + role)
- Create: `app/app/dashboard/ArchivedSites.tsx`
- Modify: `app/app/profile/page.tsx` (admin Danger Zone)
- Create: `app/app/profile/DangerZone.tsx`

### Task 2.1: Schema — `isDeleted` + partial unique name index

- [ ] **Step 1:** In `lib/db/schema.ts` `sites` table, add a column after `archivedAt`:

```ts
  isDeleted: boolean("is_deleted").notNull().default(false),
```

- [ ] **Step 2:** Change the `name` column to drop the inline `.unique()`:

```ts
  name: varchar("name", { length: 255 }).notNull(),
```

and add a partial unique index in the table's index array:

```ts
  uniqueIndex("sites_name_active_uidx").on(t.name).where(sql`${t.archivedAt} IS NULL AND ${t.isDeleted} = false`),
```

(import `uniqueIndex` is already imported; `sql` is imported.)

- [ ] **Step 3:** Generate migration

Run: `npm run db:generate`
Expected: a `0020_*.sql` dropping the `sites_name_unique` constraint, adding `is_deleted`, and creating the partial unique index. If `db:generate` does not emit the constraint drop, hand-add `ALTER TABLE public.sites DROP CONSTRAINT IF EXISTS sites_name_unique;` at the top of the generated file.

- [ ] **Step 4:** Apply + lint

Run: `npm run db:migrate && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations
git commit -m "feat(db): site is_deleted flag + active-only unique name index"
```

### Task 2.2: Exclude `isDeleted` from list/read queries

- [ ] **Step 1:** In `app/api/sites/route.ts` GET, add `eq(sites.isDeleted, false)` to both admin and supervisor `where` clauses (admin: `and(isNull(sites.archivedAt), eq(sites.isDeleted, false))`).

- [ ] **Step 2:** In `lib/services/dashboard.ts`, add `eq(sites.isDeleted, false)` to `siteWhere` for both roles.

- [ ] **Step 3:** In `app/api/sites/[id]/route.ts` GET, after fetching `record`, treat `record.isDeleted` like archived: `if (!record || record.archivedAt || record.isDeleted) return NOT_FOUND`.

- [ ] **Step 4: Lint & commit**

Run: `npm run lint` (Expected: PASS)

```bash
git add app/api/sites/route.ts lib/services/dashboard.ts app/api/sites/[id]/route.ts
git commit -m "feat(sites): hide permanently-deleted sites from reads"
```

### Task 2.3: Permanent-delete flag on DELETE + restore route

- [ ] **Step 1:** In `app/api/sites/[id]/route.ts` DELETE, read `?permanent=true` from the URL. When permanent, set `isDeleted: true` instead of archiving; otherwise keep the archive behavior. Replace the body after the `record.archivedAt` conflict check:

```ts
  const permanent = new URL(request.url).searchParams.get("permanent") === "true";

  if (permanent) {
    await db
      .update(sites)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(eq(sites.siteId, id));
    await invalidateSiteCache(id, requestId);
    return successResponse(null, 200, requestId);
  }

  if (record.archivedAt) {
    return errorResponse(ERROR_CODES.CONFLICT, "Site already archived", 409, undefined, requestId);
  }

  await db
    .update(sites)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(sites.siteId, id));
  await invalidateSiteCache(id, requestId);
  return successResponse(null, 200, requestId);
```

(Move the `record.archivedAt` early-return below the permanent branch so a permanent delete of an already-archived site still works.)

- [ ] **Step 2:** Create `app/api/sites/[id]/restore/route.ts`:

```ts
import { eq } from "drizzle-orm";

import { requireCapability } from "@/lib/auth/guards";
import { invalidateSiteCache } from "@/lib/cache/invalidate";
import { db } from "@/lib/db/client";
import { sites } from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { handleDbError } from "@/lib/errors/db";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withApiRoute } from "@/lib/http/withApi";

type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withApiRoute<RouteCtx>(async ({ request, requestId }, context) => {
  const auth = await requireCapability(request, "site:update");
  if (!("session" in auth)) {
    return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
  }

  const { id } = await context.params;
  const existing = await db.select().from(sites).where(eq(sites.siteId, id)).limit(1);
  const record = existing[0] ?? null;
  if (!record || record.isDeleted) {
    return errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId);
  }
  if (!record.archivedAt) {
    return errorResponse(ERROR_CODES.CONFLICT, "Site is not archived", 409, undefined, requestId);
  }

  try {
    await db
      .update(sites)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(sites.siteId, id));
    await invalidateSiteCache(id, requestId);
    return successResponse(null, 200, requestId);
  } catch (dbError) {
    // Active-name collision surfaces here via the partial unique index.
    const handled = handleDbError(dbError, requestId);
    if (handled) return handled;
    throw dbError;
  }
});
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/api/sites/[id]/route.ts" "app/api/sites/[id]/restore/route.ts"
git commit -m "feat(sites): permanent-delete flag + restore endpoint"
```

### Task 2.4: Tenant purge endpoint

- [ ] **Step 1:** Create `app/api/admin/purge/route.ts`:

```ts
import { z } from "zod";

import { scheduleAudit } from "@/lib/audit/log";
import { getActorRoleFromDb } from "@/lib/auth/actorRole";
import { can } from "@/lib/auth/capabilities";
import { requireCapability } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import {
  customLabourTypes, customMachineryTypes, customMaterialTypes, customUnits,
  expenseEntries, fieldRequests, genericEntries, incidentReports, labourEntries,
  machineryEntries, materialEntries, notifications, resourceRequests,
  resourceTransfers, sites,
} from "@/lib/db/schema";
import { ERROR_CODES } from "@/lib/errors/codes";
import { errorResponse, successResponse } from "@/lib/errors/response";
import { withNoStore } from "@/lib/http/cacheHeaders";
import { parseJsonBody, validateBody } from "@/lib/http/request";
import { withApi } from "@/lib/http/withApi";

const purgeSchema = z.object({ confirm: z.literal("I am Sure") }).strict();

export const POST = withApi(async ({ request, requestId }) => {
  const auth = await requireCapability(request, "site:delete");
  if (!("session" in auth)) {
    return withNoStore(errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId));
  }
  const actorRole = await getActorRoleFromDb(auth.session.user.id);
  if (!actorRole || !can(actorRole, "site:delete")) {
    return withNoStore(errorResponse(ERROR_CODES.FORBIDDEN, "Admin access required", 403, undefined, requestId));
  }

  const parsed = await parseJsonBody(request, requestId);
  if (!parsed.ok) return withNoStore(parsed.response);
  const validation = validateBody(purgeSchema, parsed.data, requestId);
  if (!validation.ok) return withNoStore(validation.response);

  // Order: children before parents. Entries/requests/transfers/incidents/
  // generic reference sites; custom catalog references user_profiles (kept).
  await db.transaction(async (tx) => {
    await tx.delete(genericEntries);
    await tx.delete(labourEntries);
    await tx.delete(materialEntries);
    await tx.delete(machineryEntries);
    await tx.delete(expenseEntries);
    await tx.delete(incidentReports);
    await tx.delete(fieldRequests);
    await tx.delete(resourceRequests);
    await tx.delete(resourceTransfers);
    await tx.delete(notifications);
    await tx.delete(customUnits);
    await tx.delete(customLabourTypes);
    await tx.delete(customMaterialTypes);
    await tx.delete(customMachineryTypes);
    await tx.delete(sites);
  });

  scheduleAudit({
    actorUserId: auth.session.user.id,
    action: "tenant.purged",
    resourceType: "tenant",
    resourceId: null,
    allowed: true,
    role: actorRole,
    metadata: {},
  });

  return withNoStore(successResponse(null, 200, requestId));
});
```

- [ ] **Step 2:** Verify `scheduleAudit` accepts `resourceId: null` (it does per `audit_logs.resource_id` nullable). If its type requires a string, pass `resourceId: "tenant"`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/purge/route.ts
git commit -m "feat(admin): tenant-wide purge endpoint (domain data only)"
```

### Task 2.5: Edit Site modal

- [ ] **Step 1:** Create `app/app/sites/[id]/EditSiteModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ModalShell } from "@/components/ui/motion";
import { requestJson } from "@/lib/http/client";
import { notifyError } from "@/lib/ui/toast";

type Supervisor = { userId: string; displayName: string };

type Site = {
  siteId: string;
  name: string;
  status: "In Progress" | "Blocked" | "Completed";
  budget: string | null;
  currentPhase: string | null;
  supervisorId: string;
};

export function EditSiteModal({
  open,
  onClose,
  site,
  supervisors,
}: {
  open: boolean;
  onClose: () => void;
  site: Site;
  supervisors: Supervisor[];
}) {
  const router = useRouter();
  const [name, setName] = useState(site.name);
  const [status, setStatus] = useState(site.status);
  const [budget, setBudget] = useState(site.budget ?? "");
  const [phase, setPhase] = useState(site.currentPhase ?? "");
  const [supervisorId, setSupervisorId] = useState(site.supervisorId);
  const [saving, setSaving] = useState(false);

  async function save() {
    const payload: Record<string, unknown> = { name: name.trim(), status, supervisorId };
    if (phase.trim()) payload.currentPhase = phase.trim();
    const budgetNum = Number(budget);
    if (budget && Number.isFinite(budgetNum) && budgetNum > 0) payload.budget = budgetNum;

    setSaving(true);
    const res = await requestJson(`/api/sites/${site.siteId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success("Site updated");
    onClose();
    router.refresh();
  }

  const label = "text-[11px] font-extrabold uppercase tracking-widest text-slate-400";
  const input = "input-standard bg-slate-900";

  return (
    <ModalShell open={open} onClose={onClose}>
      <div className="space-y-4 p-5">
        <h3 className="text-lg font-extrabold uppercase tracking-tight text-white">Edit Site</h3>
        <div className="flex flex-col gap-2">
          <label className={label}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} className={input} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={label}>Phase</label>
          <input value={phase} onChange={(e) => setPhase(e.target.value)} maxLength={100} className={input} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={label}>Budget (₹)</label>
          <input type="number" min="0" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} className={input} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={label}>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as Site["status"])} className={`${input} appearance-none`}>
            <option value="In Progress">In Progress</option>
            <option value="Blocked">Blocked</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label className={label}>Supervisor</label>
          <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} className={`${input} appearance-none`}>
            {supervisors.map((s) => (
              <option key={s.userId} value={s.userId}>{s.displayName}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary h-11 flex-1">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary h-11 flex-1 disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
```

- [ ] **Step 2:** Confirm `ModalShell` prop names (`open`, `onClose`, `children`, `className`) match `components/ui/motion.tsx`. Adjust if different.

- [ ] **Step 3: Lint & commit**

Run: `npm run lint` (Expected: PASS)

```bash
git add "app/app/sites/[id]/EditSiteModal.tsx"
git commit -m "feat(sites): edit site modal"
```

### Task 2.6: Wire Edit button + redesign delete in SiteDetailPageClient

- [ ] **Step 1:** In `app/app/sites/[id]/page.tsx`, when the viewer is admin, fetch supervisors (same merge logic as Task 1.5 — extract a shared helper `lib/users/listSupervisors.ts` returning `{ userId, displayName }[]` and call it from both `sites/new/page.tsx` and here to stay DRY). Pass `supervisors` and the full site fields (`status`, `budget`, `currentPhase`, `supervisorId`) to `SiteDetailPageClient`.

```ts
// lib/users/listSupervisors.ts
import { eq } from "drizzle-orm";

import { createSupabaseServiceClient } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { displayName } from "@/lib/users/displayName";

export async function listSupervisors(): Promise<{ userId: string; displayName: string }[]> {
  const rows = await db
    .select({ userId: userProfiles.userId, fullName: userProfiles.fullName, designation: userProfiles.designation })
    .from(userProfiles)
    .where(eq(userProfiles.role, "Supervisor"));

  const emailById = new Map<string, string>();
  try {
    const supabase = createSupabaseServiceClient();
    const perPage = 1000;
    for (let page = 1; ; page += 1) {
      const { data } = await supabase.auth.admin.listUsers({ page, perPage });
      const batch = data?.users ?? [];
      for (const u of batch) if (u.id && u.email) emailById.set(u.id, u.email);
      if (batch.length < perPage) break;
    }
  } catch {
    // best-effort
  }

  return rows.map((r) => ({
    userId: r.userId,
    displayName: displayName({ fullName: r.fullName, designation: r.designation }, emailById.get(r.userId) ?? null, r.userId),
  }));
}
```

Refactor Task 1.5's `sites/new/page.tsx` to call `listSupervisors()` (do this here to keep DRY).

- [ ] **Step 2:** In `SiteDetailPageClient.tsx`:
  - Extend `SiteDetailPageClientProps` with `supervisors: { userId: string; displayName: string }[]`.
  - Import `Edit3` from lucide-react and `EditSiteModal`.
  - Add `const [editOpen, setEditOpen] = useState(false);` and `const canEdit = can(role, 'site:update');`.
  - Replace the single delete button with a button group (Edit + redesigned Archive), e.g.:

```tsx
            <div className="flex items-center gap-2 md:self-start">
              {canEdit ? (
                <button
                  onClick={() => setEditOpen(true)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-300 hover:border-sky-500/40 hover:text-sky-400 transition-all"
                >
                  <Edit3 className="w-4 h-4" /> Edit
                </button>
              ) : null}
              <button
                onClick={() => void handleDeleteSite()}
                disabled={!canDeleteSite || deletingSite}
                title={canDeleteSite ? 'Archive site' : 'Only admins can delete sites'}
                className="inline-flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingSite ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Archive
              </button>
            </div>
```

  - Update the archive confirm copy to clarify reusability: message `Archive "${site.name}". It moves to Archived Sites (restorable from Home). The name becomes available for reuse.`
  - Render `{canEdit ? <EditSiteModal open={editOpen} onClose={() => setEditOpen(false)} site={site} supervisors={supervisors} /> : null}` before the closing `</div>`.

- [ ] **Step 3:** Ensure `app/app/sites/[id]/page.tsx` passes the new props. Read that server file first; map the site row + `role` + `supervisors` (only fetch supervisors when `can(role,'resource:manage_all')`, else pass `[]`).

- [ ] **Step 4: Lint & manual check**

Run: `npm run lint` (Expected: PASS). Then `npm run dev`, open a site as admin: Edit opens modal, saves; Archive shows new copy.

- [ ] **Step 5: Commit**

```bash
git add "app/app/sites/[id]/SiteDetailPageClient.tsx" "app/app/sites/[id]/page.tsx" app/app/sites/new/page.tsx lib/users/listSupervisors.ts
git commit -m "feat(sites): edit button + redesigned archive control"
```

### Task 2.7: Archived Sites on dashboard (admin)

- [ ] **Step 1:** In `lib/services/dashboard.ts`, extend `DashboardData` with `role: SessionUser["role"]` and `archivedSites: DashboardData["sites"]`. When `user.role === "Admin"`, also query archived (non-deleted) sites:

```ts
  const archivedSites = user.role === "Admin"
    ? await db.select().from(sites)
        .where(and(eq(sites.isDeleted, false), isNotNull(sites.archivedAt)))
        .orderBy(desc(sites.updatedAt))
    : [];
```

(import `isNotNull` from drizzle-orm.) Return `role: user.role` and `archivedSites` in the object. For supervisors, `archivedSites` is `[]`.

- [ ] **Step 2:** Create `app/app/dashboard/ArchivedSites.tsx` — a client component listing archived sites with Restore and Delete-permanently (typed-confirm) actions:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArchiveRestore, Trash2 } from "lucide-react";

import { requestJson } from "@/lib/http/client";
import { confirmDialog } from "@/lib/ui/confirm";
import { notifyError } from "@/lib/ui/toast";

type ArchivedSite = { siteId: string; name: string; location: string };

export function ArchivedSites({ sites }: { sites: ArchivedSite[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  if (sites.length === 0) return null;

  async function restore(siteId: string) {
    setBusyId(siteId);
    const res = await requestJson(`/api/sites/${siteId}/restore`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) { notifyError(res); return; }
    toast.success("Site restored");
    router.refresh();
  }

  async function purge(site: ArchivedSite) {
    const ok = await confirmDialog({
      title: "Delete permanently?",
      message: `"${site.name}" and all its data will be removed from the app. This cannot be undone.`,
      confirmLabel: "Delete permanently",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(site.siteId);
    const res = await requestJson(`/api/sites/${site.siteId}?permanent=true`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) { notifyError(res); return; }
    toast.success("Site deleted");
    router.refresh();
  }

  return (
    <section className="card-standard overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5 bg-white/5">
        <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Archived Sites</h2>
      </div>
      <ul className="divide-y divide-white/5">
        {sites.map((s) => (
          <li key={s.siteId} className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-200 uppercase tracking-tight truncate">{s.name}</p>
              <p className="text-[10px] text-slate-500 italic">{s.location}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => void restore(s.siteId)} disabled={busyId === s.siteId}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-300 hover:text-sky-400 disabled:opacity-50">
                <ArchiveRestore className="w-3.5 h-3.5" /> Restore
              </button>
              <button onClick={() => void purge(s)} disabled={busyId === s.siteId}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/20 disabled:opacity-50">
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3:** In `DashboardPageClient.tsx`, accept `data.archivedSites` and render `<ArchivedSites sites={data.archivedSites.map(s => ({ siteId: s.siteId, name: s.name, location: s.location }))} />` after the Recent Site Activity section. (Only admins receive non-empty `archivedSites`; the component self-hides when empty.)

- [ ] **Step 4: Lint & manual check**

Run: `npm run lint` (Expected: PASS). Archive a site → appears in Archived Sites on Home → Restore returns it; Delete permanently removes it.

- [ ] **Step 5: Commit**

```bash
git add lib/services/dashboard.ts app/app/dashboard/ArchivedSites.tsx app/app/dashboard/DashboardPageClient.tsx
git commit -m "feat(dashboard): admin archived sites with restore + permanent delete"
```

### Task 2.8: Danger Zone on profile (Delete Everything)

- [ ] **Step 1:** Create `app/app/profile/DangerZone.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ModalShell } from "@/components/ui/motion";
import { requestJson } from "@/lib/http/client";
import { notifyError } from "@/lib/ui/toast";

const PHRASE = "I am Sure";

export function DangerZone() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function purge() {
    setBusy(true);
    const res = await requestJson("/api/admin/purge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: PHRASE }),
    });
    setBusy(false);
    if (!res.ok) { notifyError(res); return; }
    toast.success("All data deleted");
    setOpen(false);
    router.refresh();
  }

  return (
    <section className="card-standard rounded-2xl p-4 flex flex-col gap-3 border border-red-500/20">
      <h3 className="text-lg font-extrabold tracking-tight text-error">Danger Zone</h3>
      <p className="text-xs text-on-surface-variant">
        Permanently delete every site and all logs across the workspace. This cannot be undone.
      </p>
      <button type="button" onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center justify-center gap-2 rounded border border-red-500/40 bg-red-500/10 text-xs font-semibold uppercase text-error hover:bg-red-500/20">
        Delete Everything
      </button>

      <ModalShell open={open} onClose={() => setOpen(false)}>
        <div className="space-y-4 p-5">
          <h3 className="text-lg font-extrabold uppercase tracking-tight text-white">Delete everything?</h3>
          <p className="text-sm text-slate-400">
            This removes all sites and logs for the whole workspace. Type <span className="font-bold text-white">{PHRASE}</span> to confirm.
          </p>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={PHRASE}
            className="input-standard bg-slate-900" />
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary h-11 flex-1">Cancel</button>
            <button type="button" onClick={() => void purge()} disabled={busy || text !== PHRASE}
              className="h-11 flex-1 rounded-2xl border border-red-500/40 bg-red-500/20 text-xs font-extrabold uppercase tracking-widest text-red-300 hover:bg-red-500/30 disabled:opacity-40">
              {busy ? "Deleting…" : "Delete everything"}
            </button>
          </div>
        </div>
      </ModalShell>
    </section>
  );
}
```

- [ ] **Step 2:** In `app/app/profile/page.tsx`, render `{user?.role === 'Admin' ? <DangerZone /> : null}` after the Session Operations section (import the component).

- [ ] **Step 3: Lint & manual check**

Run: `npm run lint` (Expected: PASS). As admin, the Danger Zone shows; button stays disabled until the phrase matches; as supervisor it is absent.

- [ ] **Step 4: Commit**

```bash
git add app/app/profile/DangerZone.tsx app/app/profile/page.tsx
git commit -m "feat(profile): admin danger zone — delete everything"
```

---

## WI-6 — Role visibility audit

**Files:**
- Create: `.docs/2026-06-12-role-visibility-matrix.md`
- Fix files as gaps are found.

### Task 6.1: Build the matrix

- [ ] **Step 1:** For each feature surface, record the capability gate (server) and UI gate (client). Inspect: `app/app/admin/*` (layout role guard), `AdminTabNav`, `AppFooterNav`, `SiteDetailPageClient` (edit/delete gates), `DashboardPageClient`/`ArchivedSites` (admin-only data), `profile/DangerZone`, `app/api/**` guards. Write the table to `.docs/2026-06-12-role-visibility-matrix.md` with columns: Surface | Capability | Admin sees | Supervisor sees | UI present & correct? | Notes.

- [ ] **Step 2:** Verify each negative case in a running app: sign in as Supervisor, confirm NONE of {archived sites, danger zone, edit/delete site, user mgmt, analytics, live-feed, approvals} are reachable in UI; confirm direct API calls to admin routes return 403. Sign in as Admin, confirm all are reachable. Note results in the matrix.

- [ ] **Step 3:** Fix any mismatch found (wrong/missing capability gate, leaked UI control). Each fix is its own small commit referencing the matrix row.

- [ ] **Step 4: Commit the matrix**

```bash
git add .docs/2026-06-12-role-visibility-matrix.md
git commit -m "docs: role visibility matrix for admin/supervisor"
```

---

## Final verification

- [ ] Run full suite: `npm test` — Expected: all pass.
- [ ] Typecheck: `npm run lint` — Expected: clean.
- [ ] Manual smoke as Admin: create site (named dropdown), edit via modal, archive (name reusable — create a new site with the archived name), restore, permanent-delete, units/subcategory dropdowns populated, clickable chevron, backdated log saves, Danger Zone purge on a throwaway DB.
- [ ] Manual smoke as Supervisor: confirm no admin-only controls leak.
- [ ] Update `MEMORY.md`/project memory if any non-obvious decision emerged.

---

## Self-review (author checklist — completed)

- **Spec coverage:** WI-1 (Tasks 1.1–1.5) ✓; WI-2 archive/free-name/edit/restore/permanent/purge (Tasks 2.1–2.8) ✓; WI-3 unit_master + catalog top-up (3.1–3.2) ✓; WI-4 chevron (4.1) ✓; WI-5 backdate (5.1) ✓; WI-6 audit (6.1) ✓.
- **Reusable name:** delivered via partial unique index (Task 2.1) — verified in final smoke.
- **Type consistency:** `displayName(parts, email, userId?)`, `{ userId, displayName }` supervisor shape, and `ModalShell` props are used identically across tasks.
- **Placeholders:** none — every code step carries real code; two intentional decision points (machinery seed in 3.2 step 4; `scheduleAudit` null id in 2.4 step 2) are bounded with explicit instructions.
