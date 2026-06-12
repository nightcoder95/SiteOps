# SiteOps Bug & UX Batch — Design

**Date:** 2026-06-12
**Branch:** single feature branch, one commit per work item
**Status:** Approved for planning

## Summary

Six work items batched into one branch: supervisor-name display, site
edit/delete/archive/restore + tenant purge, catalog seed gaps, an unclickable
chevron, removal of the backdating limit, and a role-visibility audit. Root
causes for each were confirmed against the current code before this design.

---

## WI-1 — Supervisor display name (Issue 1)

**Problem:** The supervisor dropdown in site creation shows `designation ?? userId`
(a UUID when designation is empty). `userProfiles` has no name; emails live in
Supabase `auth.users`.

**Decision:** Add an optional full-name field; derive from email when missing.

**Changes:**
- **Migration:** add `user_profiles.full_name varchar(120)` (nullable).
- **Schema:** add `fullName` to `userProfiles` in `lib/db/schema.ts`.
- **Profile:** add optional "Full name" input to the profile page; the profile
  update route (`/api/users/me` PATCH) accepts and persists `fullName`
  (validated `z.string().max(120).optional()`). Not mandatory.
- **Display helper:** `lib/users/displayName.ts` exporting
  `displayName({ fullName, designation }, email)`:
  1. `fullName` if set,
  2. else title-cased email local-part (`lalit.sharma` → `Lalit Sharma`,
     split on `.`/`_`/`-`/`+`),
  3. else `designation`,
  4. else email,
  5. else short UUID.
- **Sites/new server fetch** (`app/app/sites/new/page.tsx`): fetch supervisor
  profiles (`userId, fullName, designation`) and merge Supabase emails using the
  paginated `listUsers` pattern from `app/api/admin/users/route.ts`. Pass
  `{ userId, displayName }[]` to the client.
- **Form** (`SitesNewPageClient.tsx`): `Supervisor` type becomes
  `{ userId, displayName }`; dropdown renders `displayName`.

**Acceptance:** Dropdown lists human names; never shows a bare UUID when a name
or email exists. Backend assignment behaviour unchanged (admin-only).

---

## WI-2 — Site edit / archive / restore / purge (Issue 2)

**Problem:** No edit UI; the only action is a bare delete button that soft-archives.
`sites.name` is globally `UNIQUE`, so an archived name can never be reused.
No restore path, no permanent-delete path, no tenant reset.

**Decision (from user):** keep archive as default (data retained, reusable name),
add an admin Archived-Sites view with Restore + soft "Delete permanently"
(`is_deleted` flag, kept in DB, hidden from UI), and a profile-page Danger Zone
"Delete Everything" that hard-wipes all domain data tenant-wide.

### Schema / migration
- Add `sites.is_deleted boolean NOT NULL DEFAULT false`.
- Drop the plain `UNIQUE(name)` constraint; replace with a **partial unique
  index**: `UNIQUE(name) WHERE archived_at IS NULL AND is_deleted = false`.
  → active site names stay unique; archived/deleted names are reusable.

### Edit modal (admin only)
- New `EditSiteModal` (client component) with fields: name, phase, budget,
  status (`In Progress | Blocked | Completed`), supervisor (same display-name
  dropdown as WI-1, admin only). Submits to existing `PATCH /api/sites/[id]`.
- `SiteDetailPageClient`: add an **Edit** button next to delete; redesign the
  delete control (current one is a bare icon). Both gated by
  `can(role, 'site:update' / 'site:delete')`.
- UI work uses `ui-ux-pro-max` + `frontend-ui-engineering` skills.

### Archived Sites view
- Surface: reached from **Home → "View all sites"** (the sites list page,
  `app/app/sites/page.tsx`), as an admin-only "Archived" section/toggle.
- Lists sites where `archived_at IS NOT NULL AND is_deleted = false`.
- Actions:
  - **Restore** → `POST /api/sites/[id]/restore` (clears `archived_at`,
    `updated_at = now()`); guarded by `site:update`. Restore must re-check the
    partial-unique constraint and surface a clear conflict if an active site now
    holds that name.
  - **Delete permanently** → warning modal → `DELETE /api/sites/[id]` with a
    flag/param that sets `is_deleted = true` (NOT a row delete). Guarded by
    `site:delete`. Hidden from every UI thereafter; audit-logged.
- List queries across the app must exclude `is_deleted = true` rows.

### Danger Zone — Delete Everything (profile page)
- Admin-only section on the profile page.
- Modal requires typing the exact phrase `I am Sure` to enable the button.
- `POST /api/admin/purge` (guard `site:delete` + stateful actor-role re-check +
  re-validate the typed phrase in the body). **Hard delete**, single transaction:
  truncate/delete all domain data — sites, labour/material/machinery/expense/
  generic entries, incident reports, resource/field requests, resource transfers,
  notifications, custom catalog (custom labour/material/machinery types, custom
  units). **Keep:** user accounts/profiles + auth, and master catalog
  (`unit_master`, default categories/subcategories). Audit-logged.

**Acceptance:** Admin can edit a site via modal; archive → name reusable; archived
list shows restore + permanent-delete; permanently-deleted sites vanish from UI
but remain in DB with `is_deleted = true`; Delete Everything wipes domain data
after typed confirmation, leaving users + master catalog intact. All gated to admin.

---

## WI-3 — Catalog seed gaps (Issue 3)

**Problem:** `unit_master` has no seed migration (only `0009` seeds categories +
subcategories), so the units dropdown is empty. `0009` is all-or-nothing
idempotent (skips entirely if any category row exists), so DBs seeded before a
catalog change can have partial/stale data.

**Changes:**
- **New migration** seeding `unit_master` with standard construction units
  (code, label, category): count (nos/units), weight (kg, ton, bag), volume
  (litre, m³, cft), length (m, ft, mm), area (m², sqft). Idempotent per-row
  (`INSERT ... ON CONFLICT (code) DO NOTHING`).
- **New migration** to top-up missing default categories/subcategories per-row
  (`ON CONFLICT DO NOTHING` keyed on name / category+name) instead of the
  all-or-nothing guard, so existing DBs converge.
- Investigate default machinery types coverage; seed `custom_machinery_types`
  defaults only if the product expects them present out of the box (confirm
  during implementation against how the machinery form resolves options).

**Acceptance:** Units dropdown is populated on a fresh and an existing DB;
subcategory list complete for all default categories.

---

## WI-4 — Unclickable chevron (Issue 4)

**Problem:** In `CategoryPicker.tsx` the row is a `motion.div`; the select
`<button>` is `flex-1`, but the trailing chevron sits in a sibling
non-interactive `<div>` (alongside the admin delete button), so clicking the
arrow does nothing.

**Changes:**
- Move the chevron inside the `onSelect` button (or make the chevron its own
  button calling `onSelect(c)`), keeping the admin delete button separate.
- Verify the site-picker row in `LogsNewPageClient.tsx` (already a full
  `<button>`, expected fine — confirm only).

**Acceptance:** Clicking the arrow selects the category. No dead affordances.

---

## WI-5 — Remove backdating limit (Issue 5)

**Problem:** `entryDateSchema` rejects any date older than `MAX_BACKDATE_DAYS`
(7), blocking legitimate backdated logs.

**Decision (from user):** allow unlimited past dates; still block future dates.

**Changes:**
- `lib/validation/schemas.ts`: `entryDateSchema` keeps `z.string().date()` and
  the `d <= todayUtc` (no-future) check; drop the lower-bound (`>= floorUtc`)
  check.
- Retire `MAX_BACKDATE_DAYS` (remove from `constants.ts` if unused elsewhere;
  grep first).
- Date pickers: ensure no min-date restriction on entry date inputs.
- Update affected validation tests.

**Acceptance:** A log dated months ago saves; a future-dated log is still
rejected with a clear message.

---

## WI-6 — Role visibility audit (final ask)

**Deliverable:** a matrix doc (`.docs/2026-06-12-role-visibility-matrix.md`)
covering Admin vs Supervisor × feature (sites list, site detail, edit/delete,
archived view, danger zone, approvals, analytics, live-feed, users, logs, new
entry, transfers, requests). For each: the capability gate, expected UI
presence, and observed state.

**Fix mismatches found**, in particular:
- Supervisors must never see: archived-sites admin tools, Danger Zone, edit/
  delete site controls, user management, analytics/live-feed (unless intended).
- Admins must see: all sites, supervisor assignment, archived view, danger zone.
- Confirm site-scoped reads still restrict supervisors to their own sites.

**Acceptance:** Documented matrix with no unexplained gaps; any UI/capability
mismatch fixed and noted.

---

## Cross-cutting

- **Process:** bug items (WI-3/4/5) follow `systematic-debugging` (root cause
  already identified above) and `test-driven-development` where logic changes
  (WI-5 schema, WI-1 display helper). UI items (WI-2/4) use `ui-ux-pro-max` +
  `frontend-ui-engineering`.
- **Auth:** all new mutating routes use `requireCapability` + (for destructive
  admin ops) the stateful `getActorRoleFromDb` re-check pattern already used in
  `admin/users`. New destructive ops are audit-logged via `scheduleAudit`.
- **Caching:** site mutations invalidate via `invalidateSiteCache`; purge must
  invalidate broadly.
- **Migrations:** generated through the project's drizzle flow; numbered after
  `0016`.

## Out of scope
- Multi-tenant isolation (app is single-tenant).
- Restore of permanently-deleted (`is_deleted`) sites via UI (DB-only recovery).
- Reworking the entry forms beyond the date-limit change.
