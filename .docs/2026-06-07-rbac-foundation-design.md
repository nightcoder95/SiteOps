# RBAC Foundation & Closed Account Provisioning — Design Spec

**Date:** 2026-06-07
**Status:** Draft for review
**Scope:** Auth/authorization layer, admin user provisioning, audit logging

---

## 1. Context & Problem

SiteOps already has working role-based auth: two roles (`Admin`, `Supervisor`) sourced from a
`user_role` JWT claim (Supabase `custom_access_token` hook), forwarded by `middleware.ts` as the
`x-siteops-user-role` header, and enforced by centralized guards (`lib/auth/guards.ts`,
`lib/auth/ownership.ts`). It is real and unit-tested.

It does **not scale** to more roles:

- Role strings are hardcoded across many files — `parseSessionRole` accepts only two literals,
  `checkOwnership` hardcodes `role === "Admin"`, guards hardcode role names. Adding a role means
  editing many files.
- Guards are coarse (`admin` / `site_access` / `any`). There is no declarative "role X may do
  action Y on resource Z".

Three RBAC capabilities are also missing entirely:

- No frontend route guard for `/app/admin/*` (relies on API 403 + hidden nav).
- No wired role-change flow — `invalidateUserClaims` exists but has **zero callers**, and no
  endpoint sets a role.
- No audit logging of denials or privileged changes.

Additionally, the product is moving to a **closed / invite-only** model: self-signup is
disabled, admins provision all accounts, users only log in.

**Goal:** keep exactly two roles now, but make role + permission definitions a single source of
truth so adding a role/capability later is a config change, not a cross-codebase rewrite — plus
wire frontend route guards, an admin provisioning + role-management UI, and audit logging.

---

## 2. Approach: role → capability map

Roles map to capabilities (`resource:action`). All guards and ownership checks consult
capabilities, never role-string literals. Adding a role = add to the roles module + map + DB enum
migration. Adding a capability = one map edit.

### 2.1 Single source of truth (new)

- **`lib/auth/roles.ts`** — `ROLES` const, `Role` type, `ALL_ROLES: Role[]`, `isRole()`.
  Replaces scattered literals; the existing `lib/auth/constants.ts ROLES` folds into this.
- **`lib/auth/capabilities.ts`** — `Capability` union (matrix in §3),
  `ROLE_CAPABILITIES: Record<Role, ReadonlySet<Capability>>`, `can(role, capability): boolean`.

`Admin` gets the full set incl. `resource:manage_all` (cross-owner override) and the `user:*`
capabilities. `Supervisor` gets create + own-scope capabilities.

### 2.2 Refactor existing enforcement to use capabilities

- **`lib/auth/headers.ts`** — `parseSessionRole` validates via `isRole()` against `ALL_ROLES`
  instead of two hardcoded literals.
- **`lib/auth/session.ts`** — `SessionRole` derives from `roles.ts`.
- **`lib/auth/guards.ts`** — add `requireCapability(request, cap)`. Keep `requireAdmin` /
  `requireSiteAccess` / `requireAuth` as thin wrappers over it (the ~132 existing call sites keep
  working unchanged). On denial, emit an audit entry.
- **`lib/auth/ownership.ts`** — `checkOwnership` replaces `role === "Admin"` with
  `can(role, "resource:manage_all")`.

DB: `user_role` pgEnum stays. The "add a role" recipe (enum migration + `roles.ts` + map entry)
is documented inline in `roles.ts`.

---

## 3. Complete capability matrix

Derived from all 36 API route files. `A`=Admin, `S`=Supervisor. Own-scope = limited to records
the user supervises/created (enforced by `checkOwnership` + `resource:manage_all`).

| Capability | Action / routes | A | S |
|---|---|---|---|
| `site:read` | GET sites, sites/[id], /entries, /operation-summary (own-scope) | ✓ | ✓ |
| `site:read_all` | list every site regardless of owner | ✓ | ✗ |
| `site:create` | POST sites | ✓ | ✓ |
| `site:update` | PATCH sites/[id] | ✓ | ✗ |
| `site:delete` | DELETE sites/[id] (archive) | ✓ | ✗ |
| `entry:create` | POST entries/{labour,materials,machinery,expenses,incidents,dynamic} | ✓ | ✓ |
| `entry:read` | GET sites/[id]/entries (own-scope) | ✓ | ✓ |
| `entry:update` | PATCH entries/[id] (own-scope) | ✓ | ✓ |
| `entry:delete` | DELETE entries/[id] (own-scope) | ✓ | ✓ |
| `catalog:read` | GET catalog/{labour,material,machinery}-types, units/{custom,master} | ✓ | ✓ |
| `catalog:create` | POST catalog/* custom types & units | ✓ | ✓ |
| `form_category:read` | GET forms/categories, /[id] | ✓ | ✓ |
| `form_category:create` | POST forms/categories, /similar | ✓ | ✓ |
| `form_category:delete` | DELETE forms/categories/[id] | ✓ | ✗ |
| `form_subcategory:read` | GET forms/subcategories/[id] | ✓ | ✓ |
| `form_subcategory:create` | POST forms/subcategories, /similar | ✓ | ✓ |
| `form_subcategory:delete` | DELETE forms/subcategories/[id] | ✓ | ✗ |
| `field_request:create` | POST requests/field (own-scope) | ✓ | ✓ |
| `field_request:read` | GET requests/field | ✓ | ✗ |
| `field_request:approve` | PATCH requests/field/[id] | ✓ | ✗ |
| `field_request:delete` | DELETE requests/field/[id] (own or admin) | ✓ | ✓* |
| `resource_request:create` | POST requests/resource (own-scope) | ✓ | ✓ |
| `resource_request:read` | GET requests/resource | ✓ | ✓ |
| `resource_request:approve` | PATCH requests/resource/[id] | ✓ | ✗ |
| `transfer:create` | POST transfers (own-scope) | ✓ | ✓ |
| `transfer:read` | GET transfers (own-scope) | ✓ | ✓ |
| `transfer:approve` | PATCH transfers/[id] | ✓ | ✗ |
| `dashboard:read` | GET dashboard | ✓ | ✓ |
| `analytics:read` | GET admin/analytics | ✓ | ✗ |
| `live_feed:read` | GET admin/live-feed(+sse) | ✓ | ✗ |
| `notification:read` | GET notifications | ✓ | ✓ |
| `notification:update` | PATCH notifications, /[id] (mark read — own) | ✓ | ✓ |
| `profile:read_self` | GET users/me | ✓ | ✓ |
| `profile:update_self` | PATCH users/me | ✓ | ✓ |
| `user:list` | GET admin/users (new) | ✓ | ✗ |
| `user:create` | POST admin/users — provision account (new) | ✓ | ✗ |
| `user:manage_roles` | PATCH admin/users/[id]/role (new) | ✓ | ✗ |
| `resource:manage_all` | cross-owner override consumed by `checkOwnership` | ✓ | ✗ |

`*` field_request delete: owner of the request (own-scope) or any admin.

> **Note — `field_request:read` is Admin-only.** The current `GET /api/requests/field` route uses
> `requireAdmin`, so Supervisors can create field requests but not list them. The matrix preserves
> that existing behavior (no behavior change). If supervisors should see their own field requests,
> that is a separate product decision — flagged, not bundled here.

Read capabilities are mapped now (not just admin/mutation actions) so a future read-only
`Viewer` role is a pure map edit. **Per-method mapping:** route files exposing both admin and
site-access methods (`sites/[id]`, `forms/categories/[id]`, `forms/subcategories/[id]`,
`requests/field/[id]`, `entries/[id]`) map each HTTP method to its own capability rather than a
whole-route guard — so a DELETE is never accidentally widened to site-access.

---

## 4. Closed provisioning + role management

SiteOps becomes invite-only: no self-signup. Admins provision every account; users only log in.
Adds capabilities `user:create`, `user:list`, `user:manage_roles`. Admins may create **either**
role (Admin or Supervisor).

### 4.1 Disable self-signup (keep code for future)

- `app/auth/sign-up/page.tsx` — keep the file; comment out the form body and short-circuit to a
  redirect / "contact your admin" message. **Not deleted.**
- `app/api/auth/create-profile/route.ts` — keep the file; comment out the handler body, return
  410/404. **Not deleted.**
- Remove sign-up links from the sign-in page + landing so the disabled page isn't reachable via
  UI. Sign-in flow itself is unchanged.

### 4.2 First admin — direct DB seed

`auth.users` is a real Postgres table, so one SQL transaction (run once via `DIRECT_URL`) creates
the first admin. Lives in `lib/db/seeds/first-admin.sql`:

```sql
-- requires pgcrypto (Supabase has it); email pre-confirmed
insert into auth.users (id, email, encrypted_password, email_confirmed_at,
  aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (gen_random_uuid(), :email, crypt(:password, gen_salt('bf')), now(),
  'authenticated', 'authenticated', '{}', '{}', now(), now())
returning id;
-- then, with the returned id:
insert into public.user_profiles (user_id, role) values (:id, 'Admin');
```

The recipe is documented in the seed file header. Everything after the first admin goes through
the UI.

### 4.3 Create-account endpoint — `POST /api/admin/users`

Guard `requireCapability(req, "user:create")` **plus a stateful actor-role check** (§8.7): the
provisioning handler re-reads the actor's current role directly from the DB (bypassing the JWT
header) before executing, closing the stale-token window for this privilege-critical path.

Body `{ email, tempPassword, role, designation?, phone?, assignedRegion? }` (zod; `role` via
`z.enum(ALL_ROLES)`). **Validate locally first**, then call service-role
`supabase.auth.admin.createUser({ email, password, email_confirm: true })`.

Because GoTrue and Postgres cannot share one atomic transaction, use a compensating action: if
the `user_profiles` insert fails, delete the just-created auth user so no orphan remains.

```ts
const { data: authUser, error: authError } =
  await supabase.auth.admin.createUser({ email, password, email_confirm: true });
if (authError || !authUser?.user) return errorResponse(/* ... */);
try {
  await db.insert(userProfiles).values({ userId: authUser.user.id, role, /* ... */ });
} catch (dbError) {
  await supabase.auth.admin.deleteUser(authUser.user.id); // roll back orphan
  const handled = handleDbError(dbError, requestId);
  if (handled) return handled;
  throw dbError;
}
```

Set `must_change_password = true` on the profile (and mirror into the JWT claim via the custom
hook — §4.4). Audit `user.created` via `after()` (§6). Account is active immediately; the admin
shares the temp password out-of-band.

### 4.4 Force password change (temp-password hygiene) — claim-based, no DB in middleware

- Add `must_change_password boolean not null default false` to `user_profiles`; set `true` on
  provision. **This column is the source of truth.**
- Extend the existing `custom_access_token_hook` (`0008_custom_access_token_hook.sql`) to also
  read `must_change_password` and inject it as a top-level JWT claim — exactly as it already does
  for `user_role`. Middleware then decodes the claim locally (O(1)); **no DB call on the request
  path.** The revised migration must also widen the grant to
  `GRANT SELECT (user_id, role, must_change_password) ON public.user_profiles TO supabase_auth_admin`
  (the current grant is only `(user_id, role)`), or the hook can't read the new column.
- `middleware.ts` redirects authenticated users whose claim is `true` to `/auth/change-password`,
  **excluding** `/auth/change-password`, `/api/auth/change-password`, and the sign-out path to
  avoid a redirect loop (§8.1).
- `app/auth/change-password/page.tsx` posts to a **service-role** server endpoint
  `POST /api/auth/change-password` that: updates the password, sets `must_change_password = false`,
  and calls `invalidateUserClaims(userId)` (the client can't write the claim itself).
- **Critical:** after the server clears the flag, the client must call
  `supabase.auth.refreshSession()` to re-mint a token with the cleared claim **before**
  navigating away — otherwise the still-held stale claim re-triggers the redirect (loop).

### 4.5 List + role change

- `GET /api/admin/users` — list profiles (id, email, role, designation). Guard `user:list`.
- `PATCH /api/admin/users/[id]/role` — body `{ role }` via `z.enum(ALL_ROLES)`; **stateful actor
  check** (§8.7); run the **last-admin guard inside a transaction** that locks the Admin profile
  rows (`SELECT ... FOR UPDATE`, Drizzle `.for("update")`) so concurrent demotions serialize and
  cannot both pass a stale count (§8.2); update `user_profiles.role`; call
  `invalidateUserClaims(userId)` (wires it); `invalidateUserProfileCache`; audit `role.changed`
  via `after()`. Reuse `withApi`, `errorResponse`/`successResponse`, `handleDbError`.

### 4.6 Admin UI

`app/app/admin/users/page.tsx` (new) — user list + role dropdown + "Create account" form,
`requestJson` client pattern like `app/app/admin/analytics/page.tsx`. Behind the admin layout
guard (§5).

---

## 5. Frontend route guards

- **`app/app/admin/layout.tsx`** (new) — server component: read session via
  `safeGetSessionFromHeaders(await headers())`; if role lacks an admin capability, `notFound()`.
  Stops Supervisors from rendering `/app/admin/*` at all (today only nav is hidden).
- **`components/app-shell/AppFooterNav.tsx` / `AppHeader.tsx`** — swap `role === 'Admin'` checks
  for capability checks so nav/buttons stay in sync with the map.

---

## 6. Audit logging

- **Migration + `lib/db/schema.ts`** — `audit_logs` table. `actorUserId` uses
  `onDelete: "set null"` (FK valid because `userProfiles.userId` is `unique`) so audit rows
  survive user deletion:

```ts
export const auditLogs = pgTable("audit_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  actorUserId: uuid("actor_user_id")
    .references(() => userProfiles.userId, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(), // permission.denied | role.changed | user.created
  resourceType: varchar("resource_type", { length: 100 }),
  resourceId: varchar("resource_id", { length: 100 }),
  allowed: boolean("allowed").notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

- **`lib/audit/log.ts`** — `recordAudit(entry)` helper. **Scheduled via Next.js `after()` from
  `next/server`**, not a bare unawaited promise — in a serverless runtime the execution context
  can freeze the instant the response returns and abort a fire-and-forget insert. `after()` runs
  the task after the response is sent, fully and without blocking latency:

```ts
import { after } from "next/server";
after(() => { void recordAudit({ action: "permission.denied", /* ... */ }).catch(console.error); });
```

  Called from `requireCapability` on denial and from the provisioning / role-change endpoints.
  **Scope stays denials + admin writes only** — never successful reads/writes (write
  amplification + storage cost).

---

## 7. Performance (no slowdown by design)

- **Capability checks are free.** `can(role, cap)` is an in-memory `Set.has` (O(1)). The hot path
  is unchanged — role still comes from the request header; no DB/Redis/network added.
  `ROLE_CAPABILITIES` is a module-level constant built once at import.
- **Audit logging is denial-only + scheduled with `after()`.** Logs only permission denials, role
  changes, and account creation (all rare) — never successful reads/writes. `after()` runs the
  insert after the response is sent, so no user-facing latency and no risk of serverless context
  freeze truncating the write.
- **`must_change_password` is a JWT claim, not a DB lookup.** The middleware redirect decision is
  O(1) header/claim decode — no DB call added to the per-request critical path (§4.4).
- **Admin layout guard** reads the session from headers (already populated by middleware) — no
  extra DB call, no round-trip.
- **Stateful actor-role checks are scoped to two endpoints only** (`POST /api/admin/users`,
  `PATCH /api/admin/users/[id]/role`) — privilege-critical, cold paths. One DB read each, off the
  user hot path. General read/write endpoints keep trusting the stateless header.
- **Provisioning / role endpoints** are cold paths; their DB writes + `invalidateUserClaims` are
  off the user hot path.

Net: enforcement latency unchanged; the only new DB reads/writes are on denials (uncommon) and
the two admin user-management endpoints (rare).

---

## 8. Edge cases & security

1. **No self-signup escalation.** Self-signup disabled (page + `create-profile` short-circuited).
   The only account-creation path is the admin `user:create` endpoint — no client can self-insert
   a profile or pick its own role.
2. **First-admin bootstrap.** Created once by the direct DB seed (§4.2); thereafter all accounts
   come from the admin UI.
3. **Last-admin lockout (race-safe).** The role-change endpoint refuses to demote the only Admin.
   The count + update run in **one transaction with `SELECT ... FOR UPDATE`** on the Admin
   profile rows, so two simultaneous demotions serialize and cannot both pass a stale count and
   leave zero admins.
4. **Stale claims window — closed for privilege-critical paths.** Role lives in the JWT (TTL ~1h);
   `invalidateUserClaims` only re-mints on the next refresh, so a demoted admin's held token stays
   valid up to ~1h. For low-risk endpoints we accept this and trust the stateless header. For the
   two user-management endpoints (`POST /api/admin/users`, `PATCH .../role`) we do a **stateful
   DB role check** of the actor before executing — fully closing the escalation window where it
   matters (§8.7). The role-change response also surfaces "takes effect on next refresh".
5. **Service-worker / cache staleness — handled with headers, not SW mutation.** Instead of
   bumping the SW version (complex, error-prone), permission/profile-sensitive API responses send
   `Cache-Control: no-cache, no-store, must-revalidate` so they're never served stale from any
   cache. Combined with the stateful checks (#4), security holds regardless of cached UI data.
   (Trade-off: those few endpoints aren't available offline — acceptable, as permission state
   shouldn't be served stale offline.) No `app/sw.ts` changes needed.
6. **Per-method guarding.** Every method in dual-guard route files maps to its precise capability.
7. **Stateful actor check (mechanism).** On the two user-management endpoints, read the actor's
   current role straight from the DB (not the JWT header, not the 300s profile cache) and authorize
   against that. Rare, cold paths — cost is negligible.
8. **Redirect-loop exclusions.** The `must_change_password` middleware redirect explicitly excludes
   `/auth/change-password`, `/api/auth/change-password`, and the sign-out path, so the page and its
   update call can load and locked-out users can still sign out.

---

## 9. Files

**Create:** `lib/auth/roles.ts`, `lib/auth/capabilities.ts`, `lib/audit/log.ts`,
`lib/db/seeds/first-admin.sql`, `app/app/admin/layout.tsx`, `app/app/admin/users/page.tsx`,
`app/auth/change-password/page.tsx`, `app/api/auth/change-password/route.ts` (service-role:
update password + clear flag + invalidate claims), `app/api/admin/users/route.ts`
(GET list + POST create), `app/api/admin/users/[id]/role/route.ts`, audit migration +
`must_change_password` migration.

**Disable (comment out, keep for future):** `app/auth/sign-up/page.tsx`,
`app/api/auth/create-profile/route.ts`.

**Modify — auth core:** `lib/auth/headers.ts`, `lib/auth/session.ts`, `lib/auth/guards.ts`,
`lib/auth/ownership.ts`, `lib/auth/constants.ts` (remove `ROLES` — it moves to `roles.ts`;
**keep the file**, it still exports `PUBLIC_ROUTES` / `PUBLIC_ROUTE_PREFIXES` consumed by
`middleware.ts:11`), `lib/db/schema.ts`, `middleware.ts` (claim-based change-password redirect +
loop exclusions), revised `custom_access_token_hook` migration (inject `must_change_password`
claim + widen `GRANT SELECT`).

**Modify — per-method capability mapping (route handlers with method-level admin guards):**
`app/api/sites/[id]`, `app/api/forms/categories/[id]`, `app/api/forms/subcategories/[id]`,
`app/api/requests/field/[id]`, `app/api/entries/[id]`.

**Modify — inline `role === "Admin"` data-scoping checks → `can(...)`:** `app/api/sites/route.ts`
(L38, L78), `app/api/transfers/route.ts` (L56), `app/api/forms/categories/route.ts` (L36),
`app/api/forms/subcategories/route.ts` (L45), `app/api/requests/resource/route.ts` (L86). These
filter results by role and must consult the capability layer, not the literal.

**Modify — UI hardcoded role checks → capability checks:** `app/auth/sign-in/page.tsx` (remove
sign-up link), `components/app-shell/AppFooterNav.tsx`, `components/app-shell/AppHeader.tsx`,
`app/app/layout.tsx` (L9), `app/app/sites/[id]/SiteDetailPageClient.tsx` (L47, L107, L152-153),
`app/app/sites/new/SitesNewPageClient.tsx` (L12, L49, L97), `app/app/logs/new/page.tsx`
(L20, L27, L46), `app/app/sites/new/page.tsx` (L17, L22, L38).

(No `app/sw.ts` change — staleness handled via Cache-Control headers, §8.5.)

**Reuse:** `withApi` (`lib/http/withApi.ts`), `invalidateUserClaims`
(`lib/auth/refreshClaims.ts`), `invalidateUserProfileCache` (`lib/cache/invalidate.ts`),
`errorResponse`/`successResponse` (`lib/errors/response.ts`), `handleDbError` (`lib/errors/db.ts`).

---

## 10. Testing & verification

**Unit:** `capabilities.test.ts` (map correctness, `can()`), guards capability test; extend
`ownership.test.ts` (manage_all override) and `session.test.ts` (role parsing); role-change +
provisioning endpoint tests mirroring `app/api/requests/resource/[id]/route.test.ts`.

**End-to-end:**

1. `npm run typecheck` + `npm test` — all existing + new tests pass.
2. Supervisor navigates directly to `/app/admin/analytics` and `/app/admin/users` → both 404 via
   layout guard; admin nav hidden.
3. Seed first admin via `first-admin.sql` → log in → `/app/admin/users` → create a Supervisor
   with temp password → that user logs in → forced to change-password page → after change, normal
   access. Repeat creating an Admin → has admin capabilities.
4. Change a Supervisor to Admin → `user_profiles.role` updated, `invalidateUserClaims` fired,
   audit `role.changed` row written.
5. Forbidden API call as Supervisor → `audit_logs` `permission.denied` row written.
6. Scalability: a hypothetical 3rd role compiles after editing only `roles.ts`, `capabilities.ts`,
   and the enum migration — no route edits.
7. Closed-system: sign-up UI unreachable (links removed; page short-circuits); `create-profile`
   returns 410/404. Files remain in the tree (commented) for future re-enable.
8. Last-admin: attempt to demote the only Admin → 4xx, role unchanged. Concurrent-demotion test
   (two parallel PATCHes) → at least one Admin remains (transaction + `FOR UPDATE`).
9. Coverage: every capability has at least one route enforcing it and at least one test asserting
   Supervisor denial where `S = ✗`.
10. Orphan rollback: force the `user_profiles` insert to fail during provisioning → assert the
    auth user was deleted (no orphan in `auth.users`).
11. Change-password loop: provisioned user changes password → `refreshSession()` → lands on
    dashboard without bouncing back to change-password; flag cleared in DB and claim.
12. Stale-token escalation: demote an Admin, then call `POST /api/admin/users` with their still-
    valid old token → 403 (stateful actor check), even before token refresh.
13. Audit durability: trigger a denial → assert the `audit_logs` row exists after the response
    completes (`after()` ran).
