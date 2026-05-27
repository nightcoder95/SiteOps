# SiteOps — Android Port Spec

Source-of-truth doc for porting the SiteOps web PWA (Next.js 15 + Supabase + Drizzle/Postgres) to an Android native app with feature parity. Web app stays canonical backend; Android client talks to same REST API.

---

## 1. Product Overview

**Domain.** Construction site operations. Field supervisors log daily activity (labour, materials, machinery, expenses, incidents) per site. Admins oversee multiple sites: approve resource requests, approve inter-site transfers, view analytics + live activity feed, manage field schema (categories, subcategories, dynamic fields).

**Two roles.** `Admin`, `Supervisor`. Role lives in Supabase JWT claim `user_role`, forwarded by middleware as request header.

**Tech (web).** Next.js 15 App Router, React 19, Supabase Auth (SSR cookies), Drizzle ORM on Postgres, Upstash Redis cache + rate limit, Serwist PWA, PostHog, Vercel Speed Insights, Tailwind v4, Sonner toasts, Motion (framer).

**Web base URL.** Dev `http://127.0.0.1:3000`. Prod TBD. All API paths under `/api/*`. Auth pages under `/auth/*`. App pages under `/app/*`.

---

## 2. Auth

### Provider
Supabase Auth. Email + password (sign-up adds metadata). JWT signed with asymmetric keys (ES256/RS256) — middleware verifies locally via JWKS (no Auth-server round-trip).

### Web flow
- Cookies (`@supabase/ssr`) carry the session.
- Middleware (`middleware.ts`) extracts `sub`, `email`, `user_role` claims into request headers `x-auth-user-id`, `x-auth-user-email`, `x-auth-user-role`.
- `getSessionUserFromHeaders` reads them; all API routes trust the headers and call `requireAuth` / `requireAdmin` / `requireSiteAccess`.
- Role override sourced from a Supabase `custom_access_token` hook; defaults to `Supervisor`. Stale role bounded by JWT TTL — `invalidateUserClaims()` force re-mints.

### Android flow (recommended)
Use `gotrue-kt` (Supabase Kotlin SDK) or REST `/auth/v1/*` directly:
- Sign-up: `POST /auth/v1/signup` with `email`, `password`. After success, call `POST /api/auth/create-profile` to upsert `user_profiles` row.
- Sign-in: `POST /auth/v1/token?grant_type=password`. Persist `access_token` + `refresh_token` securely (EncryptedSharedPreferences or DataStore + Tink).
- Refresh: on 401 with `UNAUTHORIZED`, call `POST /auth/v1/token?grant_type=refresh_token`. Retry original request.
- Attach `Authorization: Bearer <access_token>` to every `/api/*` call. Web middleware also accepts cookies; bearer works because Supabase server client honors it.
- Sign-out: `POST /auth/v1/logout` + clear local tokens.

### Public routes (no auth)
`/`, `/auth/sign-in`, `/auth/sign-up`, `/api/health/*`, `/api/webhooks/*`.

### Authenticated redirect
Hitting `/` or auth pages while signed in redirects to `/app/dashboard`. Mirror in Android nav.

---

## 3. REST API

Base path `/api`. Standard envelope:

```json
// success
{ "success": true, "data": <T>, "meta": { "requestId": "...", "timestamp": "ISO" } }

// error
{ "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {...}? },
  "meta": { "requestId": "...", "timestamp": "ISO" } }
```

### Error codes
`VALIDATION_ERROR`, `INVALID_REQUEST`, `MISSING_FIELD`, `RATE_LIMITED`, `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` / `RESOURCE_NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` / `DATABASE_ERROR` / `UNKNOWN_ERROR` (500).

### Endpoints

**Auth / profile**
| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/auth/create-profile` | any auth | Upsert `user_profiles` row after sign-up (idempotent). |
| GET | `/api/users/me` | any | Returns `{ user, profile }`. Cached 300s. |
| PATCH | `/api/users/me` | any | Update `phone`, `assignedRegion`, `designation`. |

**Sites**
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/sites` | site_access | Admin → all non-archived. Supervisor → own only. |
| POST | `/api/sites` | site_access | Create. Supervisor self-assigned; Admin can set `supervisorId`. Fields: `name`, `location`, `status?`, `budget?`, `currentProgress?`, `currentPhase?`. |
| GET | `/api/sites/{id}` | site_access | One site. 404 if archived. Cached 300s. |
| PATCH | `/api/sites/{id}` | Admin | Update site fields. |
| DELETE | `/api/sites/{id}` | Admin | Soft delete (sets `archivedAt`). 409 if already archived. |
| GET | `/api/sites/{id}/entries` | site_access (owner) | All entry types for site (labour/material/machinery/expense/incident/dynamic). |

**Entries**
| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/entries/labour` | Supervisor (owns site) | Create labour log. |
| POST | `/api/entries/materials` | Supervisor (owns site) | Create material log. |
| POST | `/api/entries/machinery` | Supervisor (owns site) | Create machinery log. |
| POST | `/api/entries/expenses` | Supervisor (owns site) | Create expense. Triggers budget-alert notification when total ≥ 80% of budget. |
| POST | `/api/entries/incidents` | Supervisor (owns site) | Create incident. Notifies all admins. |
| POST | `/api/entries/dynamic` | Supervisor (owns site) | Create generic/dynamic entry against a `fieldDefinitionId`. Validates value type matches definition. |
| PATCH | `/api/entries/{id}?type={labour\|material\|machinery\|expense\|incident}` | owner | Edit. Blocked if site archived (`CONFLICT`). |
| DELETE | `/api/entries/{id}?type=...` | owner | Delete. Blocked if site archived. |

**Requests (resource + field)**
| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/requests/resource` | Supervisor | Submit resource request. Notifies all admins. Body: `{ siteId, type: Labour\|Materials\|Money\|Machinery, details, reason }`. |
| GET | `/api/requests/resource` | any | Admin → all; Supervisor → own. |
| PATCH | `/api/requests/resource/{id}` | Admin | Approve / Decline. |
| POST | `/api/requests/field` | Supervisor | Propose new field for a subcategory. Body: `{ siteId, proposedName, categoryId, subcategoryId?, fieldType }`. |
| GET | `/api/requests/field` | Admin | List. |
| PATCH | `/api/requests/field/{id}` | Admin | Approve / Decline. |
| DELETE | `/api/requests/field/{id}` | Admin | Remove. |

**Transfers** (resource transfers between sites)
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/transfers` | any | Admin → all; Supervisor → own (requested or approved by them). |
| POST | `/api/transfers` | Supervisor | Create transfer. `fromSiteId != toSiteId`. |
| PATCH | `/api/transfers/{id}` | Admin | Approve / Decline. Idempotent on already-resolved. Race-safe via conditional update. Notifies requester. |

**Notifications**
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/notifications?limit=20&offset=0&unreadOnly=true` | any | Paginated. Returns `{ items, total, limit, offset }`. |
| PATCH | `/api/notifications` body `{ markAllRead: true }` | any | Mark all read. |
| PATCH | `/api/notifications/{id}` | any (own) | Mark single read. |

**Dashboard**
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/dashboard` | site_access | Returns `{ user, sites: [...], notifications: { items, total } }` (top 4 unread). |

**Catalog (custom types + units)**
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET / POST | `/api/catalog/labour-types` | site_access | Custom labour types. |
| GET / POST | `/api/catalog/material-types` | site_access | Custom material types. |
| GET / POST | `/api/catalog/machinery-types` | site_access | Custom equipment types. |
| GET | `/api/catalog/units/master` | any | Standard units. |
| GET / POST | `/api/catalog/units/custom` | site_access | Custom units (optional site scoping). |

**Forms (dynamic field system)**
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET / POST | `/api/forms/categories` | site_access | List / create category. |
| GET / DELETE | `/api/forms/categories/{id}` | varies | Category detail. |
| POST | `/api/forms/categories/similar` | site_access | Fuzzy-match existing categories before create (dedupe helper). |
| GET / POST | `/api/forms/subcategories?categoryId=...` | varies | List / create subcategory + its `fieldDefinitions`. |
| GET / DELETE | `/api/forms/subcategories/{id}` | varies | Subcategory detail (includes fieldDefinitions). |
| POST | `/api/forms/subcategories/similar` | site_access | Fuzzy-match subcategories. |

**Admin**
| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/admin/analytics?period=7d\|30d\|90d` | Admin | Aggregate counts (sites, labour, materials, machinery, expenses, incidents, requests). Cached 60s. |
| GET | `/api/admin/live-feed?since=ISO` | Admin | Polled activity. |
| GET | `/api/admin/live-feed-sse?since=ISO` | Admin | Server-Sent Events. 2s tick. Emits `{ type: 'connected' }` then `{ type: 'activity', items: [...] }`. **Not usable from native Android directly with cleartext** — use polling endpoint or implement SSE via OkHttp event source. |

### Rate limiting
Upstash Redis sliding-window via `@upstash/ratelimit`. Configured per-route in `lib/rateLimit/`. 429 returns `RATE_LIMITED`. Honour `Retry-After`-style backoff client-side.

### Request IDs
Every response carries `meta.requestId`. Surface in error toasts + include in bug reports.

---

## 4. Database Schema (Postgres / Drizzle)

All tables have integer `id` (identity PK) + public `uuid` (returned to clients). Use the UUID externally. `createdAt`/`updatedAt` on most tables.

### Enums
- `site_status` = In Progress | Blocked | Completed
- `request_status` = Pending | Approved | Declined
- `transfer_status` = Pending | Approved | Declined
- `expense_category` = Labour | Materials | Equipment | Misc
- `resource_type` = Labour | Materials | Money | Machinery
- `incident_type` = Safety | Block
- `severity` = Low | Medium | High | Critical
- `notification_type` = approval | budget_alert | incident | system
- `field_type` = Number | Text | Dropdown
- `user_role` = Admin | Supervisor
- `labour_default_type` = Steel work, Shuttering, Brick work, Concrete work, Plastering, Electric work, Plumbing, Tile work, Wood work, Paint work
- `material_default_type` = Cement, M sand, P sand, Metal
- `material_unit_mode` = master | custom
- `selector_mode` = default_enum | custom

### Tables (key columns)

**user_profiles** — `profileId`, `userId` (FK to Supabase `auth.users.id`), `role`, `phone`, `assignedRegion`, `designation`.

**sites** — `siteId`, `name` (unique), `location`, `status`, `budget`, `currentProgress`, `currentPhase`, `supervisorId`, `createdByUserId`, `updatedByUserId`, `archivedAt` (soft delete).

**labour_entries** — `labourEntryId`, `siteId` (cascade), `date`, `workTypeMode`, `workTypeEnum?`, `workTypeCustomId?`, `workType`, `peopleCount`, `remarks?`, `createdBy`.

**material_entries** — `materialEntryId`, `siteId`, `date`, `materialTypeMode`, `materialTypeEnum?`, `materialTypeCustomId?`, `materialType`, `quantity` (decimal 12,2), `unitMode`, `unitMasterId?`, `unitCustomId?`, `unit`, `remarks?`, `createdBy`.

**machinery_entries** — `machineryEntryId`, `siteId`, `date`, `equipmentTypeMode`, `equipmentTypeCustomId?`, `equipmentType`, `count`, `hoursActive` (decimal 8,2, ≤24), `remarks?`, `createdBy`.

**expense_entries** — `expenseEntryId`, `siteId`, `date`, `description`, `amount` (decimal 12,2), `category` (expense_category), `createdBy`.

**incident_reports** — `incidentReportId`, `siteId`, `incidentType`, `severity`, `description`, `durationEstimate?` (minutes), `reportedBy`.

**resource_requests** — `requestId`, `siteId`, `requestType` (resource_type), `details`, `reason`, `status`, `requestedBy`, `approvedBy?`.

**field_requests** — `fieldRequestId`, `siteId`, `proposedName`, `categoryId`, `subcategoryId?`, `fieldType`, `status`, `requestedBy`.

**resource_transfers** — `transferId`, `fromSiteId`, `toSiteId`, `requestedByUserId`, `approvedByUserId?`, `resourceType`, work/material/unit mode + ids (mirrors entry shape), `quantity`, `remarks?`, `status`, `requestedAt`, `reviewedAt?`.

**notifications** — `notificationId`, `userId`, `type`, `title`, `message`, `readAt?`, `linkToView?` (web path; Android needs deep-link mapping).

**categories** — `categoryId`, `name` (unique, case-insensitive lookup), `icon?`.

**subcategories** — `subcategoryId`, `categoryId` (cascade), `name`.

**field_definitions** — `fieldDefinitionId`, `subcategoryId`, `label`, `fieldType`, `unit?`, `options?` (jsonb, dropdown choices). Unique on (subcategory, label).

**generic_entries** — `genericEntryId`, `siteId`, `date`, `fieldDefinitionId` (cascade), `value` (jsonb — string | number | boolean), `createdBy`.

**custom_labour_types / custom_material_types / custom_machinery_types** — name + `isActive` + audit cols.

**unit_master** — `unitId`, `code` (unique), `label`, `category`, `isActive`.

**custom_units** — `unitId`, `siteId?`, `name`, `symbol?`, `isActive`.

### Indexes
Heavy use of partial indexes for "active sites only" filter (`WHERE archived_at IS NULL`) and "unread notifications only" (`WHERE read_at IS NULL`). Composite `(site_id, date desc, created_at desc)` on every entry table for fast site-history pagination.

---

## 5. Validation Rules (mirror in Android client + server)

- All IDs are UUID v4 (`uuidSchema`).
- `entryDateSchema` — entry date must be within last `MAX_BACKDATE_DAYS` (check `lib/validation/constants.ts`). UTC-string compare to avoid TZ skew.
- `peopleCount` 1–10000 int.
- `quantity` 0–1000000.
- `hoursActive` 0–24.
- `count` (machinery) 1–10000 int.
- `expense.amount` 0–1000000; `description` 1–500.
- `incident.description` 1–2000; `durationEstimate` 1–10080 minutes (1 week).
- `resourceRequest.details` 10–1000; `reason` 10–500.
- `remarks` ≤500.
- `transfer` — `fromSiteId != toSiteId`.

Two shapes per entry: **legacy** (free-text `workType`/`materialType`/`unit`) and **mode-based** (`default_enum` with enum value, OR `custom` with UUID FK). Android can default to mode-based; legacy kept for backward compat.

Dynamic entry — value type must match `fieldDefinition.fieldType`:
- `Number` → finite number
- `Text` → string
- `Dropdown` → string ∈ `options[]`

---

## 6. Authorization Rules

Implemented in `lib/auth/guards.ts` + `lib/auth/ownership.ts`:

- `requireAuth` — any signed-in user.
- `requireAdmin` — role === Admin.
- `requireSiteAccess` — Admin or Supervisor.
- `checkOwnership(user, ownerId)` — Admin always passes; Supervisor only when `user.id === ownerId`.

Per-resource:
- Supervisor can only **create entries** on sites they supervise.
- Supervisor can only **edit/delete** their own entries.
- **Archived site** → all writes blocked (`409 CONFLICT`), reads OK.
- Site `PATCH` / `DELETE` → Admin only.
- Transfer review → Admin only.
- Field/resource request approval → Admin only.

---

## 7. Screens / Routes (web → Android nav map)

| Web route | Purpose | Android destination |
|---|---|---|
| `/` | Landing → redirects | Splash, decides nav |
| `/auth/sign-in` | Email+password | SignInScreen |
| `/auth/sign-up` | Email+password+metadata | SignUpScreen |
| `/app/dashboard` | Sites list + unread notif preview | DashboardScreen (start_url) |
| `/app/sites` | Sites list | SitesListScreen |
| `/app/sites/new` | Create site | CreateSiteScreen |
| `/app/sites/{id}` | Site detail + entries feed | SiteDetailScreen |
| `/app/logs/new` | Pick category → log entry | NewLogCategoryScreen |
| `/app/logs/new/{categoryId}` | Dynamic form for category | DynamicEntryFormScreen |
| `/app/logs/{entryId}` | Entry detail / edit | EntryDetailScreen |
| `/app/requests/resource` | Submit resource request | ResourceRequestScreen |
| `/app/requests/field` | Propose field | FieldRequestScreen |
| `/app/transfers/new` | New inter-site transfer | NewTransferScreen |
| `/app/notifications` | List, paginated | NotificationsScreen |
| `/app/profile` | View / edit profile | ProfileScreen |
| `/app/admin/analytics` | Charts, period switch | AdminAnalyticsScreen |
| `/app/admin/approvals` | Pending requests + transfers | AdminApprovalsScreen |
| `/app/admin/expenses` | Cross-site expense view | AdminExpensesScreen |
| `/app/admin/live-feed` | Real-time activity (SSE) | AdminLiveFeedScreen (poll/SSE) |

Bottom nav (suggested): Dashboard, Logs (new), Requests, Notifications, Profile. Admin-only items shown conditionally based on `user.role`.

Deep links: map web `linkToView` notification paths (`/app/sites/{id}` etc.) to Android `siteops://app/sites/{id}` or App Links.

---

## 8. Key Workflows

### Sign-up
1. `POST /auth/v1/signup` (Supabase).
2. On success, `POST /api/auth/create-profile` (idempotent upsert).
3. Land on dashboard.

### Log a labour entry (Supervisor)
1. Pick site (from dashboard or sites list).
2. New log → choose category (Labour).
3. Pick work type (enum or custom-typed via combobox; can create new custom type via `/api/catalog/labour-types`).
4. Enter date (within backdate window), peopleCount, optional remarks.
5. `POST /api/entries/labour`. Server validates ownership + archive state. Returns 201 + entry.
6. Side-effect: admin analytics cache invalidated (fire-and-forget).

### Submit expense → budget alert
1. Supervisor logs expense.
2. Server computes `getSiteTotalExpenses`. If `total / budget ≥ 0.8`, notify supervisor + all admins (`budget_alert` type, link to site).

### Submit incident
1. Supervisor reports incident with severity.
2. All admins notified (`incident` type).

### Resource request → approval
1. Supervisor `POST /api/requests/resource`. All admins notified.
2. Admin opens approvals → `PATCH /api/requests/resource/{id}` with `{ status: Approved | Declined }`.

### Inter-site transfer
1. Supervisor `POST /api/transfers` (Source ≠ Destination).
2. Admin reviews; conditional update guards two-admin race. Idempotent on already-resolved status. Notifies requester.

### Dynamic form (categories/subcategories/field definitions)
1. Admin sets up category → subcategory → `fieldDefinitions` (label, type, optional options for Dropdown).
2. Supervisor opens `/app/logs/new/{categoryId}`; client fetches subcategories + field defs.
3. Renders form per `fieldType`; submits each filled field as a `generic_entries` row via `POST /api/entries/dynamic`.
4. Server enforces value-type match.

### Field-request workflow
Supervisor proposes a new field for a subcategory → admin approves and (manually) creates `fieldDefinitions` row; or rejects.

---

## 9. Notifications

Server-pushed via DB `notifications` table only. **No native push wired up on web today.** For Android:
- Poll `/api/notifications?unreadOnly=true` periodically + on app foreground.
- Optional: add FCM. Server would need a `device_tokens` table + token registration endpoint + dispatch on notify events. Not in current backend.

Types: `approval`, `budget_alert`, `incident`, `system`. Each has `title`, `message`, `linkToView`. Mark read individually or all.

---

## 10. Caching & Performance

- Upstash Redis cache via `getOrSetJson` with key + TTL.
  - User profile: 300s.
  - Site: 300s.
  - Admin analytics: 60s.
- Invalidation: `invalidateSiteCache`, `invalidateUserProfileCache`, `invalidateAdminAnalyticsCache` — called fire-and-forget (`runNonCritical`) after writes; if cache invalidation fails, request still succeeds.
- Android: implement its own cache (Room + Store/Coil for images). Don't trust client cache for write paths — always round-trip.

---

## 11. Realtime / Live feed

- `/api/admin/live-feed-sse` is SSE, 2s polling tick on server. Plain HTTP polling alternative is `/api/admin/live-feed?since=ISO`.
- For Android: OkHttp SSE event source works, but easier to just poll `?since=` every 5–10s while admin view is foregrounded.

---

## 12. Error Handling / Edge Cases

- **401** → token expired → refresh + retry; failure → sign-out flow.
- **403** → show "no permission" UI; do not retry.
- **404** on site → likely archived; pop back + invalidate local cache.
- **409 CONFLICT** → resource changed (archived site, already-reviewed transfer) → reload + show toast.
- **429 RATE_LIMITED** → exponential backoff (start 1s, cap 16s).
- **5xx** → toast + retry button. Surface `requestId` for bug reports.
- **Validation errors** — `error.details` is a per-field map (`fieldErrors` from Zod `flatten()`). Map to form-field error states.
- **Offline** — web has Serwist SW with `ApiUnavailableBanner` shown when fetch fails. Android: use OkHttp + ConnectivityManager; queue mutations? (Not in current scope — backend has no idempotency tokens, so risky.) Minimum: detect offline, disable submit, show banner.
- **Backdate window** — entries older than `MAX_BACKDATE_DAYS` are server-rejected. Show date-picker bound on client.
- **Archived site** — read-only; edit/delete blocked. Hide write affordances when `site.archivedAt != null`.
- **Race on transfer/request approval** — server is idempotent for same-status retries; mismatched status → 409.
- **Duplicate guard** on entries — `lib/services/duplicateGuard.ts` blocks rapid identical resubmits.
- **Custom type name collisions** — case-insensitive uniqueness on categories; check via `/api/forms/categories/similar` and `/api/forms/subcategories/similar` before creating to give a "did you mean…" UX.

---

## 13. External Services

- **Supabase** — Auth + Postgres. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, service key server-side.
- **Upstash Redis** — Cache + rate limit. Env: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Not needed by Android.
- **PostHog** — Analytics. Android: use PostHog Android SDK with the same project key for cross-platform funnels.
- **Vercel Speed Insights** — Web only.

---

## 14. Suggested Android Stack

- **Language**: Kotlin.
- **Min SDK**: 26 (Android 8) — covers 95%+ + needed for modern crypto + Java time.
- **UI**: Jetpack Compose + Material 3. Dark theme default (matches web `#0b1220` background).
- **Nav**: Navigation Compose.
- **DI**: Hilt.
- **Networking**: Retrofit + OkHttp + Kotlinx Serialization. Interceptor for `Authorization` + automatic token refresh on 401.
- **Auth SDK**: `io.github.jan-tennert.supabase:gotrue-kt` (or raw REST).
- **Local DB**: Room — mirror sites, recent entries, draft entries, notifications.
- **Forms / validation**: hand-rolled state holders mirroring Zod rules. Helper to map server `details` to field errors.
- **Image / icon**: Coil.
- **Date/time**: kotlinx-datetime; UTC compares for date eligibility.
- **Crash / logs**: Sentry or Firebase Crashlytics.
- **Build flavors**: dev (points at local/web staging), prod.

---

## 15. Open Items for Android Port

1. **Base URL** — confirm prod URL; web dev binds `127.0.0.1:3000`. Set per build flavor.
2. **Push notifications** — backend currently DB-only. If FCM is desired, add server-side dispatch + `device_tokens` table.
3. **Deep links** — map `notifications.linkToView` (web paths) to App Links/intents.
4. **Offline writes** — decide whether to queue or block. Backend has no idempotency-key support; queueing risks duplicates.
5. **SSE vs poll** for admin live feed — start with polling, upgrade later.
6. **Sign-up metadata** — confirm what fields the web form sends; Android must match for the `custom_access_token` hook to assign role correctly.
7. **Admin-only screens** — gate behind `user.role === "Admin"` from `/api/users/me`.
8. **Camera / photo evidence** — not in current schema. Add later via Supabase Storage + new `entry_attachments` table if needed.

---

## 16. Reference Files (web)

- `lib/db/schema.ts` — full schema.
- `lib/validation/schemas.ts` — Zod schemas (mirror in Android).
- `lib/auth/guards.ts`, `lib/auth/ownership.ts`, `lib/auth/session.ts` — authz model.
- `middleware.ts` — JWT verification + header injection.
- `lib/errors/codes.ts`, `lib/errors/response.ts` — wire format.
- `lib/services/dashboard.ts` — dashboard payload shape.
- `app/api/**/route.ts` — every endpoint.
- `components/logs/DynamicEntryForm.tsx`, `components/logs/entryFieldRegistry.ts` — dynamic form behavior.
- `public/manifest.json` — branding (theme `#0b1220`, name "SiteOps").
