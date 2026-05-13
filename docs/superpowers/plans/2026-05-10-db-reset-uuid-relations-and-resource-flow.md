# DB Reset + UUID Relation Model + Resource Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset non-auth data model to integer PK + UUID business IDs, move all non-auth FKs to UUID keys, and implement structured labour/material/machinery + transfer approval workflow with duplicate prevention.

**Architecture:** Replace current non-auth schema with a reset migration and aligned Drizzle definitions, then update validation, query layer, API routes, and UI forms to use business UUID identifiers and mode-based type selection (`default_enum` vs `custom`). Add global unit master + custom units and an approval-gated transfer ledger.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM, PostgreSQL, Zod, Vitest/Playwright.

---

### Task 1: Add New Enums and Table Definitions in Drizzle Schema

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/migrations/schema.ts`

- [ ] **Step 1: Write failing schema shape tests for new enums/tables**
```ts
// lib/validation/schemas.test.ts (append)
import { describe, it, expect } from "vitest";
import { labourEntrySchema } from "@/lib/validation/schemas";

describe("new mode fields exist", () => {
  it("requires workTypeMode and enum/custom selector", () => {
    const parsed = labourEntrySchema.safeParse({
      siteId: "550e8400-e29b-41d4-a716-446655440000",
      date: "2026-05-10",
      workTypeMode: "default_enum",
      workTypeEnum: "Concrete work",
      peopleCount: 5,
    });
    expect(parsed.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npm run test -- lib/validation/schemas.test.ts`
Expected: FAIL for unknown fields / schema mismatch.

- [ ] **Step 3: Update `lib/db/schema.ts` with new enums/tables/columns**
```ts
export const labourTypeModeEnum = pgEnum("labour_type_mode", ["default_enum", "custom"]);
export const resourceTransferStatusEnum = pgEnum("resource_transfer_status", ["Pending", "Approved", "Declined"]);

export const sites = pgTable("sites", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  siteId: uuid("site_id").notNull().unique().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  location: varchar("location", { length: 255 }).notNull(),
  status: siteStatusEnum("status").notNull().default("In Progress"),
  budget: decimal("budget", { precision: 15, scale: 2 }),
  currentProgress: integer("current_progress"),
  currentPhase: varchar("current_phase", { length: 100 }),
  createdByUserId: uuid("created_by_user_id").notNull(),
  updatedByUserId: uuid("updated_by_user_id").notNull(),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

- [ ] **Step 4: Mirror the same model in `lib/db/migrations/schema.ts`**
```ts
export const sites = pgTable("sites", {
  id: integer().generatedAlwaysAsIdentity().primaryKey().notNull(),
  siteId: uuid("site_id").defaultRandom().notNull(),
  // ...keep in sync with lib/db/schema.ts
});
```

- [ ] **Step 5: Run typecheck**
Run: `npm run -s tsc -- --noEmit`
Expected: PASS.

### Task 2: Create Reset SQL Migration for Non-Auth Tables

**Files:**
- Create: `lib/db/migrations/0003_reset_non_auth_int_pk_uuid_keys.sql`
- Modify: `lib/db/migrations/meta/_journal.json`

- [ ] **Step 1: Write migration smoke test command first**
Run: `npm run db:generate`
Expected: FAIL until reset SQL and schema are consistent.

- [ ] **Step 2: Author reset migration SQL**
```sql
-- Drop only non-auth domain tables and recreate with new structure
DROP TABLE IF EXISTS resource_transfers CASCADE;
DROP TABLE IF EXISTS labour_entries CASCADE;
DROP TABLE IF EXISTS material_entries CASCADE;
-- ...all non-auth tables

CREATE TABLE sites (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL UNIQUE,
  location varchar(255) NOT NULL,
  status site_status NOT NULL DEFAULT 'In Progress',
  budget numeric(15,2),
  current_progress integer,
  current_phase varchar(100),
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  updated_by_user_id uuid NOT NULL REFERENCES users(id),
  archived_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
```

- [ ] **Step 3: Add new tables for custom types, units, transfers**
```sql
CREATE TABLE unit_master (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unit_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  code varchar(30) NOT NULL UNIQUE,
  label varchar(100) NOT NULL,
  category varchar(50) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
```

- [ ] **Step 4: Seed Indian-standard unit master**
```sql
INSERT INTO unit_master (code, label, category) VALUES
('nos','Nos','count'),('bag_50kg','Bag (50 kg)','package'),('kg','Kilogram','weight'),
('tonne','Tonne','weight'),('cum','Cubic Meter','volume'),('sqft','Square Foot','area'),
('sqm','Square Meter','area'),('rft','Running Foot','length'),('m','Meter','length'),
('trip','Trip','transport'),('hr','Hour','time'),('day','Day','time');
```

- [ ] **Step 5: Run migration generation/check**
Run: `npm run db:generate`
Expected: PASS and migration metadata updated.

### Task 3: Update Relations and Query Contracts to UUID Business Keys

**Files:**
- Modify: `lib/db/migrations/relations.ts`
- Modify: `lib/db/queries/sites.ts`
- Modify: `lib/db/queries/entries.ts`
- Modify: `lib/db/queries/liveFeed.ts`

- [ ] **Step 1: Add failing query-level tests for UUID key lookups**
```ts
// tests to ensure fetchSiteById now expects siteId UUID path value
expectTypeOf(getSiteById).parameters.toEqualTypeOf<[string, string]>();
```

- [ ] **Step 2: Run targeted tests to confirm failure**
Run: `npm run test -- tests`
Expected: FAIL where old `id` assumptions exist.

- [ ] **Step 3: Update relation mappings to new uuid FK columns**
```ts
export const labourEntriesRelations = relations(labourEntries, ({ one }) => ({
  site: one(sites, {
    fields: [labourEntries.siteId],
    references: [sites.siteId],
  }),
}));
```

- [ ] **Step 4: Refactor query filters/joins to use `*_id` UUID columns**
```ts
.where(eq(sites.siteId, siteId))
```

- [ ] **Step 5: Re-run tests impacted by query layer**
Run: `npm run test -- lib/db`
Expected: PASS.

### Task 4: Replace Zod Schemas with Mode-Based Entry Payloads

**Files:**
- Modify: `lib/validation/schemas.ts`
- Modify: `lib/validation/schemas.test.ts`

- [ ] **Step 1: Write failing tests for mode consistency rules**
```ts
it("rejects default mode without enum", () => {
  const result = labourEntrySchema.safeParse({
    siteId: "550e8400-e29b-41d4-a716-446655440000",
    date: "2026-05-10",
    workTypeMode: "default_enum",
    peopleCount: 3,
  });
  expect(result.success).toBe(false);
});
```

- [ ] **Step 2: Run schema tests and confirm failure**
Run: `npm run test -- lib/validation/schemas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement discriminated unions for labour/material/machinery**
```ts
const labourDefault = z.object({
  workTypeMode: z.literal("default_enum"),
  workTypeEnum: z.enum(["Steel work", "Shuttering", "Brick work", "Concrete work", "Plastering", "Electric work", "Plumbing", "Tile work", "Wood work", "Paint work"]),
  workTypeCustomId: z.never().optional(),
});
```

- [ ] **Step 4: Add material unit union validation**
```ts
const materialUnitMaster = z.object({
  unitMode: z.literal("master"),
  unitMasterId: uuidSchema,
  unitCustomId: z.never().optional(),
});
```

- [ ] **Step 5: Re-run schema test suite**
Run: `npm run test -- lib/validation/schemas.test.ts`
Expected: PASS.

### Task 5: Implement Duplicate-Prevention Utilities for Custom Types/Units

**Files:**
- Modify: `lib/utils/stringSimilarity.ts`
- Modify: `lib/services/nonCritical.ts`
- Modify: `app/api/forms/categories/similar/route.ts`
- Create: `lib/services/duplicateGuard.ts`
- Create: `lib/services/duplicateGuard.test.ts`

- [ ] **Step 1: Write failing tests for normalization + fuzzy threshold**
```ts
expect(isNearDuplicate("cement ", ["Cement"])).toBe(true);
expect(isNearDuplicate("concret work", ["Concrete work"])).toBe(true);
```

- [ ] **Step 2: Run duplicate tests and confirm failure**
Run: `npm run test -- lib/services/duplicateGuard.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement shared duplicate guard service**
```ts
export function normalizeName(input: string) {
  return input.toLowerCase().trim().replace(/\s+/g, " ");
}
```

- [ ] **Step 4: Integrate guard into existing and new create flows**
```ts
const verdict = checkDuplicateOrSimilar(name, existingNames, 0.87);
if (verdict.blocked) return NextResponse.json(verdict, { status: 409 });
```

- [ ] **Step 5: Re-run test suite for utils/services**
Run: `npm run test -- lib/utils/stringSimilarity.test.ts lib/services/duplicateGuard.test.ts`
Expected: PASS.

### Task 6: Add APIs for Custom Types and Units

**Files:**
- Create: `app/api/catalog/labour-types/route.ts`
- Create: `app/api/catalog/material-types/route.ts`
- Create: `app/api/catalog/machinery-types/route.ts`
- Create: `app/api/catalog/units/master/route.ts`
- Create: `app/api/catalog/units/custom/route.ts`
- Create: route tests under matching `*.test.ts`

- [ ] **Step 1: Add failing route tests for create/list endpoints**
```ts
expect(response.status).toBe(201);
expect(body.name).toBe("Scaffolding");
```

- [ ] **Step 2: Run new route tests and confirm failure**
Run: `npm run test -- app/api/catalog`
Expected: FAIL (routes missing).

- [ ] **Step 3: Implement list/create handlers with auth + duplicate checks**
```ts
if (request.method === "POST") {
  await requireSiteAccess(request);
  // validate body, duplicate check, insert
}
```

- [ ] **Step 4: Wire services/queries for each catalog endpoint**
```ts
await db.insert(customMaterialTypes).values({ materialTypeId: crypto.randomUUID(), name, createdByUserId: user.id });
```

- [ ] **Step 5: Re-run route tests**
Run: `npm run test -- app/api/catalog`
Expected: PASS.

### Task 7: Add Transfer APIs with Approval Workflow

**Files:**
- Create: `app/api/transfers/route.ts`
- Create: `app/api/transfers/[id]/route.ts`
- Create: `app/api/transfers/route.test.ts`
- Modify: `lib/db/queries/notifications.ts`

- [ ] **Step 1: Write failing tests for supervisor create + admin approve**
```ts
expect(createResponse.status).toBe(201);
expect(createJson.status).toBe("Pending");
expect(approveResponse.status).toBe(200);
expect(approveJson.status).toBe("Approved");
```

- [ ] **Step 2: Run tests and confirm failure**
Run: `npm run test -- app/api/transfers/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `POST /api/transfers` and `GET /api/transfers`**
```ts
// supervisor creates pending transfer
status: "Pending",
requestedByUserId: session.user.id,
```

- [ ] **Step 4: Implement `PATCH /api/transfers/[id]` for admin decisions**
```ts
if (session.user.role !== "Admin") return forbidden();
```

- [ ] **Step 5: Re-run transfer tests**
Run: `npm run test -- app/api/transfers/route.test.ts`
Expected: PASS.

### Task 8: Update Existing Entry Routes for New Payload Model

**Files:**
- Modify: `app/api/entries/labour/route.ts`
- Modify: `app/api/entries/materials/route.ts`
- Modify: `app/api/entries/machinery/route.ts`
- Modify: `app/api/entries/[id]/route.ts`

- [ ] **Step 1: Add failing tests for enum/custom branches**
```ts
expect(customPayloadResponse.status).toBe(201);
expect(defaultPayloadResponse.status).toBe(201);
```

- [ ] **Step 2: Run entry route tests and confirm failures**
Run: `npm run test -- app/api/entries`
Expected: FAIL on old payload assumptions.

- [ ] **Step 3: Update handlers to parse new schemas**
```ts
const payload = labourEntrySchema.parse(await request.json());
```

- [ ] **Step 4: Map payload mode fields to DB columns**
```ts
workTypeMode: payload.workTypeMode,
workTypeEnum: payload.workTypeMode === "default_enum" ? payload.workTypeEnum : null,
workTypeCustomId: payload.workTypeMode === "custom" ? payload.workTypeCustomId : null,
```

- [ ] **Step 5: Re-run entry tests**
Run: `npm run test -- app/api/entries`
Expected: PASS.

### Task 9: Align UI Flows (Site -> Category -> Subtype -> Entry -> Transfer)

**Files:**
- Modify: `components/views/SiteSelectionView.tsx`
- Modify: `components/views/CategorySelectionView.tsx`
- Modify: `components/views/SubcategorySelectionView.tsx`
- Modify: `components/views/LabourEntryView.tsx`
- Modify: `components/views/MaterialsEntryView.tsx`
- Modify: `components/views/MachineryEntryView.tsx`
- Modify: `components/views/ApprovalCenterView.tsx`
- Create: `components/views/TransferEntryView.tsx`

- [ ] **Step 1: Add failing UI tests for required new flows**
```ts
expect(screen.getByText(/create new site/i)).toBeInTheDocument();
expect(screen.getByText(/transfer/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run UI tests and confirm failures**
Run: `npm run test -- tests/app-shell-layout.test.ts`
Expected: FAIL or missing elements.

- [ ] **Step 3: Implement add-site and category/subcategory selection updates**
```tsx
<Button onClick={openCreateSite}>Create Site</Button>
```

- [ ] **Step 4: Implement enum/custom selectors and master/custom units in forms**
```tsx
<Select value={unitMode} onValueChange={setUnitMode}>
  <SelectItem value="master">Master Unit</SelectItem>
  <SelectItem value="custom">Custom Unit</SelectItem>
</Select>
```

- [ ] **Step 5: Add transfer creation form and admin review UI actions**
```tsx
<Button onClick={() => updateTransferStatus(transferId, "Approved")}>Approve</Button>
```

### Task 10: Verification Pass (No Commit)

**Files:**
- Modify: `docs/superpowers/pending-implementation.md`

- [ ] **Step 1: Run full unit/integration tests**
Run: `npm run test`
Expected: PASS.

- [ ] **Step 2: Run e2e smoke and route migration checks**
Run: `npm run test:e2e -- e2e/smoke.spec.ts e2e/route-migration.spec.ts`
Expected: PASS.

- [ ] **Step 3: Run typecheck and lint (if configured)**
Run: `npm run -s tsc -- --noEmit`
Expected: PASS.

- [ ] **Step 4: Update implementation tracker**
```md
- [x] DB reset migration
- [x] UUID FK migration
- [x] transfer approval flow
```

- [ ] **Step 5: Record verification summary for handoff**
```md
All tests and checks passed locally; no commit performed per user instruction.
```

## Self-Review

Spec coverage check:
- Integer PK + UUID business keys for non-auth tables: covered in Tasks 1-3.
- UUID relationships: covered in Tasks 1-3.
- Sites nullability/default rule: covered in Task 1/2.
- Labour/material/machinery enum + custom extension: covered in Tasks 1, 4, 6, 8, 9.
- Global Indian unit master + custom units: covered in Tasks 2, 6, 8, 9.
- Transfer pending -> admin approval: covered in Task 7 and Task 9.
- Semantic/fuzzy duplicate prevention: covered in Task 5 and Task 6.
- UX flow updates: covered in Task 9.
- Verification: covered in Task 10.

Placeholder scan:
- No TBD/TODO placeholders remain.

Type consistency scan:
- Uses `*_mode` with `default_enum|custom` consistently.
- Uses UUID business IDs in API payloads consistently.

