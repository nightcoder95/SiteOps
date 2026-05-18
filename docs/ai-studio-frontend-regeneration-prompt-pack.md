# SiteOps AI Studio Frontend Regeneration Prompt Pack

## 1) Master Prompt (Use First in AI Studio)

You are generating a frontend-only UI regeneration for an existing Next.js App Router project named `SiteOps`.

### Mission
Rebuild the UI for all user-facing routes with improved visual quality, but preserve backend/API/DB behavior exactly. The output must be drop-in compatible with the current codebase.

### Non-negotiable constraints
- Do not change route paths.
- Do not change API endpoints, HTTP methods, query params, payload keys, or response key expectations.
- Do not change authorization/role behavior.
- Do not change server/client boundaries where currently established.
- Do not add required backend fields.
- Do not rename exported components that are existing integration points.

### Architecture to preserve
- Framework: Next.js App Router + TypeScript + Tailwind utilities + design tokens in `app/globals.css`.
- App shell structure:
  - `components/app-shell/AppShell.tsx`
  - `components/app-shell/AppHeader.tsx`
  - `components/app-shell/AppFooterNav.tsx`
- Route shell mounting:
  - `app/app/layout.tsx` loads session and role, then renders `AppShell`.
- Reusable form engines that must keep behavior contract:
  - `components/logs/EntryForm.tsx`
  - `components/logs/CategoryPicker.tsx`
  - `components/logs/SubcategoryCombobox.tsx`
  - `components/transfers/TransferForm.tsx`
- Primitive/util components in active use:
  - `components/ui/page-primitives.tsx`
  - `components/ui/motion.tsx`
  - `components/ui/ApiUnavailableBanner.tsx`

### Design constraints
- Keep current token system from `app/globals.css` (`--color-*`, typography tokens, spacing aliases).
- Keep mobile-safe-area behavior and fixed header/footer model.
- Keep all current loading/error/unavailable states.
- Improve hierarchy, spacing consistency, card composition, information density, and interaction polish.
- No backend/db logic in UI generation.

### Code style/output constraints
- TypeScript React components only.
- Preserve existing import alias style (`@/...`).
- Keep accessibility: semantic headings, labels, aria attributes, keyboard-friendly controls.
- Keep optimistic UX patterns where currently present.

### Scope
Generate UI updates for:
- Auth: `/auth/sign-in`, `/auth/sign-up`
- App: `/app/dashboard`, `/app/notifications`, `/app/profile`, `/app/logs/new`, `/app/logs/new/[categoryId]`, `/app/logs/[entryId]`, `/app/sites/[id]`, `/app/sites/new`, `/app/requests/resource`, `/app/requests/field`, `/app/transfers/new`, `/app/admin/live-feed`, `/app/admin/analytics`, `/app/admin/approvals`, `/app/admin/expenses`
- Utility app routes: `/app` redirect behavior intact, `app/app/error.tsx` behavior intact
- Keep `/app/sites` as intentional `notFound()` route.

### Required output format from AI Studio
For each route/component prompt, return:
1. Updated component code (drop-in replacement).
2. Explicit statement: "No API contract changed".
3. A checklist of preserved endpoints/methods/params used in that file.
4. A quick visual intent summary (3-5 bullets).

---

## 2) Route and API Contract Map (Source of Truth)

Use this as immutable integration contract.

### Auth routes
- `/auth/sign-in` (`app/auth/sign-in/page.tsx`)
  - Supabase `signInWithPassword`
  - calls `POST /api/auth/create-profile` (best effort)
- `/auth/sign-up` (`app/auth/sign-up/page.tsx`)
  - Supabase `signUp`
  - calls `POST /api/auth/create-profile` (best effort)

### App routes
- `/app/dashboard`
  - server loader: `app/app/dashboard/page.tsx`
  - client UI: `app/app/dashboard/DashboardPageClient.tsx`
  - data from `getDashboardData(session.user)`
- `/app/notifications`
  - `GET /api/notifications?limit=50&offset=0&unreadOnly=false`
  - `PATCH /api/notifications/:id`
  - `PATCH /api/notifications` body `{ markAllRead: true }`
- `/app/profile`
  - `GET /api/users/me`
  - `PATCH /api/users/me` body subset of `{ phone, assignedRegion, designation }`
- `/app/logs/new`
  - server-preloaded sites/categories; choose site then category
- `/app/logs/new/[categoryId]`
  - renders `EntryForm` create flow
- `/app/logs/[entryId]?type=...`
  - renders `EntryForm` edit/delete flow
- `/app/sites/[id]`
  - initial server data from site + entries
  - client filter calls `GET /api/sites/:id/entries?type=<all|labour|material|machinery|expense|incident>`
  - admin delete calls `DELETE /api/sites/:id`
- `/app/sites/new`
  - server page + `SitesNewPageClient`
  - submit through existing sites create flow (`POST /api/sites` in client)
- `/app/requests/resource`
  - `GET /api/requests/resource`
  - `POST /api/requests/resource`
  - `PATCH /api/requests/resource/:id`
- `/app/requests/field`
  - `GET /api/requests/field`
  - `POST /api/requests/field`
  - `PATCH /api/requests/field/:id`
  - `DELETE /api/requests/field/:id`
- `/app/transfers/new`
  - `POST /api/transfers`
- `/app/admin/live-feed`
  - realtime via Supabase channel (no API mutation)
- `/app/admin/analytics`
  - `GET /api/admin/analytics?period=<7d|30d|90d>`
- `/app/admin/approvals`
  - `GET /api/requests/resource`
  - `GET /api/requests/field`
  - `GET /api/transfers`
  - `GET /api/forms/categories`
  - `GET /api/forms/categories/:id`
  - `PATCH /api/requests/resource/:requestId`
  - `PATCH /api/requests/field/:fieldRequestId`
  - `PATCH /api/transfers/:transferId`
- `/app/admin/expenses`
  - `GET /api/sites`
  - `GET /api/sites/:siteId/entries?type=expense`

### Utility routes
- `/app` redirects to `/app/dashboard`.
- `app/app/error.tsx` is client error boundary with reset action.
- `/app/sites` intentionally returns `notFound()`.

---

## 3) Per-Screen Prompts (Run Sequentially or in Batches)

## Prompt A: App Shell + Global Visual System
Target files:
- `app/globals.css`
- `components/app-shell/AppShell.tsx`
- `components/app-shell/AppHeader.tsx`
- `components/app-shell/AppFooterNav.tsx`

Instructions:
- Improve spacing rhythm, navigation affordance, active states, typography balance, and header/footer visual hierarchy.
- Keep role-based nav items and route matching exactly the same.
- Keep safe-area top/bottom offsets and fixed shell behavior.
- Do not alter route title resolution logic except visual rendering.
- Preserve `notifications` badge behavior and dashboard-specific header behavior.

Must preserve:
- all existing `href` values and regex matching in footer nav.
- same prop interfaces for `AppShell`, `AppHeader`, `AppFooterNav`.

Acceptance checks:
- Admin and Supervisor nav still differ exactly as before.
- `/app/dashboard` remains the only route without back button by default.
- Main content remains scrollable within shell.

## Prompt B: Dashboard
Target files:
- `app/app/dashboard/page.tsx` (no behavior change)
- `app/app/dashboard/DashboardPageClient.tsx`

Instructions:
- Redesign dashboard cards/sections for clarity and premium feel.
- Keep all links and counts behavior identical.
- Keep site list expand/collapse logic and admin-only section.

Must preserve:
- props shape `DashboardPageClient({ data })`.
- navigation links to sites/admin panels/notifications.

Acceptance checks:
- same number sources and same link destinations.
- no extra API calls added in client component.

## Prompt C: Site Detail
Target files:
- `app/app/sites/[id]/page.tsx` (no behavior change)
- `app/app/sites/[id]/SiteDetailPageClient.tsx`

Instructions:
- Upgrade site summary block, metric cards, entry type chips, and entry list cards.
- Keep type filter behavior and all entry link generation.
- Keep delete flow (Admin only) and same confirmation semantics.

Must preserve:
- `GET /api/sites/:id/entries?type=...`
- `DELETE /api/sites/:id`
- links to `/app/logs/new?siteId=...`, `/app/transfers/new?fromSite=...`, `/app/logs/:id?type=...`

Acceptance checks:
- all/all-type rendering logic remains identical.
- no payload/param shape changes.

## Prompt D: Logs Flow (Create/Edit)
Target files:
- `app/app/logs/new/page.tsx`
- `app/app/logs/new/LogsNewPageClient.tsx`
- `app/app/logs/new/[categoryId]/page.tsx`
- `app/app/logs/[entryId]/page.tsx`
- `components/logs/EntryForm.tsx`
- `components/logs/CategoryPicker.tsx`
- `components/logs/SubcategoryCombobox.tsx`

Instructions:
- Improve step flow clarity, form readability, and field grouping.
- Keep dynamic field behavior exactly as driven by registry + category/subcategory logic.
- Keep submit/update/delete endpoints and payload building untouched.

Must preserve:
- `EntryForm` prop contract.
- endpoint resolution from `entryFieldRegistry`.
- category/subcategory request and merge-request behavior.

Acceptance checks:
- create/update/delete flows still route back to site or dashboard exactly the same.
- required field validations unchanged semantically.

## Prompt E: Requests (Resource + Field)
Target files:
- `app/app/requests/resource/page.tsx`
- `app/app/requests/field/page.tsx`

Instructions:
- Improve form-card and queue-card structures.
- Keep same optimistic/pending button states and action availability by status.
- Keep all status chips and review actions.

Must preserve endpoints:
- Resource: `GET/POST /api/requests/resource`, `PATCH /api/requests/resource/:id`
- Field: `GET/POST /api/requests/field`, `PATCH/DELETE /api/requests/field/:id`

Acceptance checks:
- same request body keys as current implementation.
- pending actions disabled behavior preserved.

## Prompt F: Transfers
Target files:
- `app/app/transfers/new/page.tsx`
- `components/transfers/TransferForm.tsx`

Instructions:
- Improve dual-site selection and resource-type switch visuals.
- Keep all validation and payload key behavior exactly same.

Must preserve:
- `POST /api/transfers` payload keys (`fromSiteId`, `toSiteId`, `resourceType`, `quantity`, `remarks`, plus labour/material mode keys).

Acceptance checks:
- same routing on success.
- same field requirement conditions.

## Prompt G: Notifications
Target file:
- `app/app/notifications/page.tsx`

Instructions:
- Improve unread/read visual distinction and metadata layout.
- Keep mark-one and mark-all behavior with optimistic updates.

Must preserve endpoints:
- `GET /api/notifications?limit=50&offset=0&unreadOnly=false`
- `PATCH /api/notifications/:id`
- `PATCH /api/notifications` with `{ markAllRead: true }`

Acceptance checks:
- unread count logic unchanged.
- optional `linkToView` handling unchanged.

## Prompt H: Profile
Target file:
- `app/app/profile/page.tsx`

Instructions:
- Improve profile hero and editable form layout.
- Keep read-only display + update form semantics.

Must preserve endpoints:
- `GET /api/users/me`
- `PATCH /api/users/me`

Acceptance checks:
- same payload inclusion behavior (only non-empty fields sent).

## Prompt I: Admin Analytics
Target file:
- `app/app/admin/analytics/page.tsx`

Instructions:
- Improve period selector and stat visualization.
- Keep period state + fetch cycle exactly same.

Must preserve endpoint:
- `GET /api/admin/analytics?period=...`

Acceptance checks:
- no contract changes to expected response keys.

## Prompt J: Admin Approvals
Target file:
- `app/app/admin/approvals/page.tsx`

Instructions:
- Improve multi-queue structure and review UX scannability.
- Keep optimistic actions and reload semantics.
- Preserve duplicate category/subcategory review merge controls.

Must preserve endpoints:
- `GET /api/requests/resource`
- `GET /api/requests/field`
- `GET /api/transfers`
- `GET /api/forms/categories`
- `GET /api/forms/categories/:id`
- `PATCH /api/requests/resource/:id`
- `PATCH /api/requests/field/:id`
- `PATCH /api/transfers/:id`

Acceptance checks:
- status transitions and merge-target payload keys unchanged.

## Prompt K: Admin Expenses
Target file:
- `app/app/admin/expenses/page.tsx`

Instructions:
- Improve site selector + expense list readability.
- Keep total computations and loading states.

Must preserve endpoints:
- `GET /api/sites`
- `GET /api/sites/:siteId/entries?type=expense`

Acceptance checks:
- same `type=expense` query usage.

## Prompt L: Admin Live Feed
Target file:
- `app/app/admin/live-feed/page.tsx`

Instructions:
- Improve feed card structure and connection status UI.
- Keep Supabase realtime subscription logic unchanged.

Must preserve:
- FEED_SOURCES mapping and type mapping behavior.
- no API substitution.

Acceptance checks:
- state transitions (`loading`, `ready`, `error`) identical.

## Prompt M: Auth Pages
Target files:
- `app/auth/sign-in/page.tsx`
- `app/auth/sign-up/page.tsx`

Instructions:
- Improve auth form composition and accessibility.
- Keep Supabase auth calls and post-auth profile creation call.

Must preserve:
- sign in: `signInWithPassword`
- sign up: `signUp`
- both call `POST /api/auth/create-profile` best effort.

Acceptance checks:
- same redirects and router refresh behavior.

## Prompt N: Utility / Edge Screens
Target files:
- `app/app/page.tsx` (redirect unchanged)
- `app/app/error.tsx`
- `app/app/sites/page.tsx` (must remain `notFound()`)

Instructions:
- Visual polish allowed for error boundary only.
- keep behavior for redirect and `notFound` exactly intact.

Acceptance checks:
- redirect and `notFound()` behavior unchanged.

---

## 4) Integration Checklist (Drop-in Replacement)

1. Create branch for UI regeneration only.
2. Apply AI Studio outputs file-by-file; do not modify `app/api/**`, `lib/db/**`, or server query layers.
3. For each changed file, verify:
   - endpoints identical,
   - methods identical,
   - query params identical,
   - body keys identical.
4. Keep exported component names and prop interfaces unchanged where imported elsewhere.
5. Verify shell integrity:
   - fixed header/footer still intact,
   - safe-area paddings still intact,
   - content scrolling region still in `main` area.
6. Verify role behavior:
   - Admin and Supervisor see same route access/nav as before.
7. Verify flows manually:
   - logs create/edit/delete,
   - site detail filters and links,
   - resource/field request submit/review,
   - transfer submit,
   - notifications mark read/all,
   - profile update,
   - admin analytics/approvals/expenses/live feed.
8. Run checks:
   - `npm run lint`
   - `npm run test` (or current project test command)
   - route smoke run in browser/mobile viewport.
9. Internal cleanup pass:
   - mark `components/views/*` as legacy in docs/comments only unless still referenced.
   - do not delete potentially reusable files until final verification is complete.

---

## 5) Optional Prompt Footer for Every AI Studio Run

Append this footer to each run:

"Before finalizing, print a `Contract Parity Report` listing every endpoint used in this file and confirm exact match with original paths, methods, query params, and payload keys. If any differ, regenerate until they match exactly."

---

## 6) Verification Todo For AI

Use this as a post-generation audit prompt for any created UI project or regenerated screen set.

### Verification Mission
Verify that the generated UI project matches the original SiteOps frontend structure, route map, form contracts, and user flows without changing backend or database behavior.

### Structural Checks
- Confirm the project keeps the same top-level App Router layout pattern.
- Confirm server components still own data fetching where they currently do.
- Confirm client components still own interactive form and optimistic UI behavior where they currently do.
- Confirm reusable component boundaries are still present and used consistently.
- Confirm no new backend-facing files were introduced inside `app/api/**`, `lib/db/**`, or other server contract layers.

### File/Folder Structure Checks
- Confirm these areas still exist and are used correctly:
  - `app/app/layout.tsx`
  - `components/app-shell/*`
  - `components/logs/*`
  - `components/transfers/*`
  - `components/ui/*`
  - `app/app/dashboard/*`
  - `app/app/sites/*`
  - `app/app/logs/*`
  - `app/app/requests/*`
  - `app/app/notifications/*`
  - `app/app/profile/*`
  - `app/app/admin/*`
  - `app/auth/*`
- Confirm route files still map to the same URLs.
- Confirm any generated redesign still fits the existing import/alias pattern (`@/...`).

### API Route Checks
Verify the UI still calls the same endpoints with the same methods and payload shapes.

- Auth
  - `POST /api/auth/create-profile`
- Dashboard
  - no direct client mutation endpoints
- Notifications
  - `GET /api/notifications?limit=50&offset=0&unreadOnly=false`
  - `PATCH /api/notifications/:id`
  - `PATCH /api/notifications`
- Profile
  - `GET /api/users/me`
  - `PATCH /api/users/me`
- Sites and site details
  - `GET /api/sites`
  - `POST /api/sites`
  - `GET /api/sites/:id/entries?type=...`
  - `DELETE /api/sites/:id`
- Logs and entries
  - `POST /api/entries/labour`
  - `POST /api/entries/materials`
  - `POST /api/entries/machinery`
  - `POST /api/entries/expenses`
  - `POST /api/entries/incidents`
  - `POST /api/entries/dynamic`
  - `PATCH /api/entries/:id?type=...`
  - `DELETE /api/entries/:id?type=...`
- Log taxonomy helpers
  - `GET /api/forms/categories`
  - `GET /api/forms/categories/:id`
  - `GET /api/forms/categories/similar`
  - `POST /api/forms/categories`
  - `DELETE /api/forms/categories/:id`
  - `GET /api/forms/subcategories/similar`
  - `POST /api/forms/subcategories`
  - `DELETE /api/forms/subcategories/:id`
- Requests
  - `GET /api/requests/resource`
  - `POST /api/requests/resource`
  - `PATCH /api/requests/resource/:id`
  - `GET /api/requests/field`
  - `POST /api/requests/field`
  - `PATCH /api/requests/field/:id`
  - `DELETE /api/requests/field/:id`
- Transfers
  - `POST /api/transfers`
  - `PATCH /api/transfers/:id`
- Admin
  - `GET /api/admin/analytics?period=7d|30d|90d`
  - realtime Supabase feed subscriptions only for live feed

### Form Field Checks
Check that the generated UI uses the same form fields and field semantics.

- Sign in
  - email
  - password
- Sign up
  - name
  - email
  - password
  - confirmPassword
- Profile update
  - phone
  - assignedRegion
  - designation
- Resource request
  - siteId
  - type
  - details
  - reason
- Field request
  - siteId
  - proposedName
  - categoryId
  - subcategoryId
  - fieldType
- Transfer request
  - fromSiteId
  - toSiteId
  - resourceType
  - workTypeEnum or materialTypeEnum depending on resource type
  - unitCustomId for materials
  - quantity
  - remarks
- Site creation
  - preserve existing fields and supervisor assignment behavior
- Entry form
  - preserve dynamic field generation from category metadata
  - preserve edit/delete support by entry type

### UI Flow Checks
Validate the same journey still exists from screen to screen.

- Auth flow
  - sign in and sign up route to dashboard after success.
- Dashboard flow
  - dashboard shows site list, admin shortcuts, and recent activity.
  - site cards route to site detail.
- Site flow
  - site detail shows metadata, progress, filter chips, and entry links.
  - add log entry and transfer actions route correctly.
- Logs flow
  - choose site first, then category, then entry form.
  - edit route loads existing data and can delete entry.
- Requests flow
  - user can submit resource and field requests.
  - admin can approve or decline requests.
- Notifications flow
  - user can mark one or all as read.
- Profile flow
  - user can inspect current profile and save updates.
- Admin flow
  - analytics period switching updates stats.
  - approvals queue supports all review actions.
  - expenses page switches sites and recomputes totals.
  - live feed shows realtime status and activity stream.

### Interaction Checks
Verify that every user-facing interactive element exists and behaves the same.

- Buttons and CTAs
  - all primary submit buttons still exist and submit the same forms
  - all secondary actions still exist and route or toggle the same views
  - all destructive actions still require the same confirmation or authorization
  - all approve/decline/mark-read/withdraw/delete/archive actions remain available where they were before
  - all back buttons, menu buttons, and header action buttons remain present
  - all footer nav items remain present with the same active-state behavior
  - all inline links and card CTAs still route to the same destinations
- Form controls
  - all text inputs remain text inputs
  - all email inputs remain email inputs
  - all password inputs remain password inputs
  - all number inputs remain number inputs
  - all date inputs remain date inputs
  - all textareas remain textareas
  - all select dropdowns remain select dropdowns
  - all category/subcategory pickers still work as controlled selectors
  - all toggles or segmented controls still switch the same state
  - all checkbox-like, radio-like, or chip-like selectors preserve their original semantics
- Field behavior
  - required fields are still required
  - optional fields remain optional
  - disabled states still block the same actions
  - loading states still disable the same controls
  - optimistic UI state still updates the same items before server confirmation
  - error banners still appear when the same request failures occur
- Navigation and linking
  - site cards, request cards, notification items, and entry cards still link to the same routes
  - header back/menu actions still navigate the same way
  - success redirects still go to the same pages
  - query-string driven navigation still uses the same params

### UI Element Inventory To Confirm
Ask the AI to explicitly confirm the following classes of interactive items were recreated:

- Auth page buttons and links
  - sign in
  - sign up
  - show/hide password
  - forgot password link
  - switch between sign in and sign up
- Dashboard items
  - site cards
  - show all / show less
  - admin shortcut cards
  - recent activity items
  - notifications shortcut in header
- Site detail items
  - entry type filter chips
  - add log entry CTA
  - transfer CTA
  - delete/archive site CTA
  - entry list cards
- Logs flow items
  - choose site buttons
  - change site button
  - category cards
  - form field controls generated per category
  - submit / update / delete entry buttons
  - back to category link
- Resource request items
  - site id input
  - resource type select
  - details textarea
  - reason textarea
  - submit request button
  - approve / decline buttons
- Field request items
  - site id input
  - proposed name input
  - category id input
  - subcategory id input
  - field type select
  - submit request button
  - approve / decline / withdraw buttons
- Transfer items
  - from site select
  - to site select
  - labour/material resource type selector
  - work type select
  - material type select
  - unit id input
  - quantity input
  - remarks textarea
  - request transfer button
- Notifications items
  - mark all read button
  - mark read per item
  - notification view link
- Profile items
  - phone input
  - assigned region input
  - designation input
  - save button
- Admin items
  - analytics period select
  - approval buttons for resource/field/transfer
  - duplicate merge category select
  - duplicate merge subcategory select
  - site selector in expenses
  - realtime live feed connection/status display

### Final Verification Requirement
The AI must answer the following with explicit coverage statements:
- all buttons were recreated
- all CTAs were recreated
- all form field types were recreated
- all dropdown/select controls were recreated
- all links and route transitions were recreated
- all delete/approve/decline/mark-read/archive actions were recreated
- all loading, error, and optimistic states were recreated
- no backend or database contract was changed

### Acceptance Questions The AI Must Answer
Ask the AI to respond with explicit yes/no answers for each:
- Did the regenerated project preserve all original routes?
- Did it preserve all original API calls and payload/query contracts?
- Did it preserve the same form fields and dynamic field behavior?
- Did it preserve the same role-based navigation and access rules?
- Did it preserve the same create/edit/delete/approve/decline/read flows?
- Did it avoid modifying backend or database logic?
- Did it keep the same server/client component boundaries where required?
- Did it keep the regenerated UI drop-in compatible with the existing codebase?

### Suggested Output Format For The Verification AI
1. `Structure Review`
2. `Route Review`
3. `API Review`
4. `Form Review`
5. `Flow Review`
6. `Risks / Mismatches`
7. `Pass / Fail Summary`

### Short Todo Prompt You Can Paste Into AI
```text
Audit this generated SiteOps UI project against the original frontend contract.

Check file/folder structure, route mapping, API routes, form fields, and UI flow.
Verify that every screen still uses the same endpoints, methods, query params, payload keys, role behavior, and navigation paths as the original project.

Return:
- structure mismatches
- route mismatches
- API mismatches
- form field mismatches
- UI flow mismatches
- anything that could break backend/db integration
- a final pass/fail verdict

Do not suggest backend changes. Do not rename routes or endpoints. Do not add required fields.
```
