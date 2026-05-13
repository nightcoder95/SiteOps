# Route-Driven Legacy UX Migration Implementation Plan

# superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate legacy mobile UI/UX from in-memory navigation to pure Next.js App Router routes while preserving old visual behavior and wiring all screens to live APIs.

**Architecture:** Keep current `/app/*` route topology and replace `components/App.tsx` state-machine navigation with URL-driven pages/layouts. Introduce a shared route shell (header/footer/transitions), shared API client error handling, and nested forms routes. Preserve role-based behavior (Supervisor/Admin) via existing backend guards and frontend conditional rendering.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Better Auth, Drizzle ORM, Postgres (Neon), Zod, Tailwind CSS v4, Playwright, Vitest.

---

## Execution Rules (No Drift)

- Always execute tasks in order.
- Do not skip failing-test-first steps.
- Do not delete old files until the cleanup gate.
- Use live APIs only; no mock fallback.
- When endpoint is unavailable, show explicit endpoint message in UI.
- Commit after each task with the exact commit message pattern in this plan.

## Route Contract (Approved)

- Keep existing route base: `/app/*`
- Forms flow must be nested routes:
  - `/app/forms/site`
  - `/app/forms/category`
  - `/app/forms/subcategory`
  - `/app/forms/new`
- Add admin routes:
  - `/app/admin/approvals`
  - `/app/admin/expenses`

## File Structure Map

### New files to create

- `components/app-shell/AppHeader.tsx` - reusable sticky header.
- `components/app-shell/AppFooterNav.tsx` - fixed bottom nav with route links.
- `components/app-shell/AppShell.tsx` - layout wrapper with safe-area spacing.
- `components/ui/ApiUnavailableBanner.tsx` - endpoint-unavailable message component.
- `lib/http/client.ts` - centralized client fetch helper.
- `lib/http/client.test.ts` - tests for unavailable endpoint detection.
- `lib/navigation/formsFlow.ts` - parse/validate forms flow query params.
- `lib/navigation/formsFlow.test.ts` - tests for forms flow param logic.
- `app/app/admin/approvals/page.tsx` - admin approvals UI route.
- `app/app/admin/expenses/page.tsx` - admin expense manager UI route.
- `app/app/forms/site/page.tsx` - step 1 forms flow.
- `app/app/forms/category/page.tsx` - step 2 forms flow.
- `app/app/forms/subcategory/page.tsx` - step 3 forms flow.
- `app/app/forms/new/page.tsx` - step 4 forms flow.
- `e2e/route-migration.spec.ts` - route-level regression coverage.

### Existing files to modify

- `app/app/layout.tsx` - replace temporary nav shell with old-style route shell.
- `app/app/forms/page.tsx` - make it a redirect/entry point into nested forms flow.
- `app/app/dashboard/page.tsx` - remove legacy state-machine mount and render route-native dashboard.
- `app/app/sites/page.tsx` - align UI with legacy visuals while keeping live API.
- `app/app/sites/[id]/page.tsx` - align worksite dashboard visuals and actions.
- `app/app/requests/resource/page.tsx` - legacy UX styling + live data.
- `app/app/requests/field/page.tsx` - legacy UX styling + live data.
- `app/app/notifications/page.tsx` - legacy UX styling + live data.
- `app/app/profile/page.tsx` - legacy settings/profile UX + live data.
- `app/app/admin/analytics/page.tsx` - old analytics visual treatment with live API.
- `app/app/admin/live-feed/page.tsx` - old live feed visual treatment.
- `components/GlobalFooter.tsx` - convert to route-aware nav wrapper or replace usage.
- `components/App.tsx` - deprecate and then retire in cleanup gate.
- `e2e/smoke.spec.ts` - keep and extend baseline auth checks.

---

### Task 1: Baseline Safety Net and Contract Freeze

**Files:**
- Modify: `.docs/execution_plan.md`
- Test: `e2e/smoke.spec.ts`

- [ ] **Step 1: Create failing route migration smoke tests**

```ts
// e2e/route-migration.spec.ts (initial red tests)
test('forms flow routes exist', async ({ page }) => {
  await page.goto('/app/forms/site');
  await expect(page).not.toHaveURL(/404/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx playwright test e2e/route-migration.spec.ts`
Expected: FAIL with route missing / heading missing.

- [ ] **Step 3: Add route contract section at top of each new page file as comment**

```ts
// Route contract: /app/forms/site (Supervisor/Admin)
```

- [ ] **Step 4: Commit**

```bash
git add e2e/route-migration.spec.ts .docs/execution_plan.md
git commit -m "test: add red route-migration safety net"
```

### Task 2: Shared App Shell (Header/Footer/Safe Area)

**Files:**
- Create: `components/app-shell/AppHeader.tsx`, `components/app-shell/AppFooterNav.tsx`, `components/app-shell/AppShell.tsx`
- Modify: `app/app/layout.tsx`
- Test: `e2e/route-migration.spec.ts`

- [ ] **Step 1: Write failing expectation for footer nav visibility on non-dashboard routes**

```ts
test('app shell renders footer nav on /app/sites', async ({ page }) => {
  await page.goto('/app/sites');
  await expect(page.getByRole('navigation', { name: /primary app nav/i })).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test e2e/route-migration.spec.ts -g "footer nav"`
Expected: FAIL (nav not found).

- [ ] **Step 3: Implement minimal shell components and wire layout**

```tsx
// components/app-shell/AppShell.tsx
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-svh bg-background relative overflow-hidden flex flex-col pt-[var(--sat)] pl-[var(--sal)] pr-[var(--sar)]">
      <AppHeader />
      <main className="flex-1 overflow-y-auto no-scrollbar pb-[calc(env(safe-area-inset-bottom)+5rem)]">{children}</main>
      <AppFooterNav aria-label="Primary App Nav" />
    </div>
  );
}
```

- [ ] **Step 4: Re-run test to verify pass**

Run: `npx playwright test e2e/route-migration.spec.ts -g "footer nav"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/app-shell app/app/layout.tsx e2e/route-migration.spec.ts
git commit -m "feat: add route-driven shared app shell"
```

### Task 3: Shared API Client + Missing Endpoint Messaging

**Files:**
- Create: `lib/http/client.ts`, `lib/http/client.test.ts`, `components/ui/ApiUnavailableBanner.tsx`
- Modify: `app/app/notifications/page.tsx` (pilot integration)
- Test: `lib/http/client.test.ts`

- [ ] **Step 1: Write failing unit tests for unavailable endpoint detection**

```ts
// lib/http/client.test.ts
it('marks endpoint unavailable on 404', async () => {
  // mock fetch 404
  // expect(result.kind).toBe('endpoint_unavailable')
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- lib/http/client.test.ts`
Expected: FAIL (module not implemented).

- [ ] **Step 3: Implement minimal client helper**

```ts
// lib/http/client.ts
export type ClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: 'endpoint_unavailable' | 'api_error' | 'network_error'; message: string; endpoint: string };
```

Rules:
- `404`/`405` => `endpoint_unavailable`
- `{ success:false }` => `api_error`
- thrown fetch error => `network_error`

- [ ] **Step 4: Render banner in pilot page**

```tsx
{error?.kind === 'endpoint_unavailable' ? (
  <ApiUnavailableBanner endpoint={error.endpoint} method="GET" />
) : null}
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- lib/http/client.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/http/client.ts lib/http/client.test.ts components/ui/ApiUnavailableBanner.tsx app/app/notifications/page.tsx
git commit -m "feat: add shared api client and endpoint-unavailable messaging"
```

### Task 4: Forms Nested Routes Skeleton

**Files:**
- Create: `app/app/forms/site/page.tsx`, `app/app/forms/category/page.tsx`, `app/app/forms/subcategory/page.tsx`, `app/app/forms/new/page.tsx`
- Modify: `app/app/forms/page.tsx`
- Create: `lib/navigation/formsFlow.ts`, `lib/navigation/formsFlow.test.ts`

- [ ] **Step 1: Write failing tests for forms flow param parsing**

```ts
it('requires siteId before category step', () => {
  expect(parseCategoryStepParams(new URLSearchParams())).toEqual({ ok: false });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- lib/navigation/formsFlow.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement param parsing utility**

```ts
export function parseCategoryStepParams(params: URLSearchParams) {
  const siteId = params.get('siteId');
  if (!siteId) return { ok: false as const, reason: 'Missing siteId' };
  return { ok: true as const, siteId };
}
```

- [ ] **Step 4: Implement route skeleton pages with guarded redirects**

Example:
```tsx
// /app/forms/category/page.tsx
if (!parsed.ok) redirect('/app/forms/site');
```

- [ ] **Step 5: Convert `/app/forms` into entry redirect**

```tsx
redirect('/app/forms/site');
```

- [ ] **Step 6: Run tests**

Run:
- `npm run test -- lib/navigation/formsFlow.test.ts`
- `npx playwright test e2e/route-migration.spec.ts -g "forms flow routes exist"`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/app/forms lib/navigation e2e/route-migration.spec.ts
git commit -m "feat: scaffold nested forms routes with guarded flow"
```

### Task 5: Supervisor Route UX Parity (Route-by-Route)

**Files:**
- Modify: `app/app/dashboard/page.tsx`, `app/app/sites/page.tsx`, `app/app/sites/[id]/page.tsx`, `app/app/requests/resource/page.tsx`, `app/app/requests/field/page.tsx`, `app/app/notifications/page.tsx`, `app/app/profile/page.tsx`
- Use: `components/views/*` as visual source only (no in-memory navigation reuse)

- [ ] **Step 1: Add failing e2e checks for key supervisor surfaces**

```ts
test('dashboard shows legacy-style quick actions', ...)
test('site detail allows entry type switch', ...)
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npx playwright test e2e/route-migration.spec.ts -g "supervisor"`
Expected: FAIL.

- [ ] **Step 3: Implement dashboard route-native UI**

Requirements:
- No `currentView` / stack state.
- Buttons navigate via `Link`/`router.push`.
- Role-aware cards preserved.

- [ ] **Step 4: Implement sites list/detail legacy visual parity with existing live APIs**

Requirements:
- Reuse existing fetch endpoints.
- Keep loading/error/empty states explicit.
- Show endpoint message when unavailable.

- [ ] **Step 5: Implement requests/notifications/profile visual parity**

Requirements:
- All POST/PATCH actions stay live.
- Form submit buttons disable while pending.

- [ ] **Step 6: Run tests**

Run:
- `npm run lint`
- `npx playwright test e2e/route-migration.spec.ts -g "supervisor"`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/app/dashboard/page.tsx app/app/sites/page.tsx app/app/sites/[id]/page.tsx app/app/requests/resource/page.tsx app/app/requests/field/page.tsx app/app/notifications/page.tsx app/app/profile/page.tsx e2e/route-migration.spec.ts
git commit -m "feat: migrate supervisor routes to legacy ux with live apis"
```

### Task 6: Forms End-to-End Functional Migration

**Files:**
- Modify: `app/app/forms/site/page.tsx`, `app/app/forms/category/page.tsx`, `app/app/forms/subcategory/page.tsx`, `app/app/forms/new/page.tsx`
- Modify: `app/api/forms/categories/route.ts`, `app/api/forms/categories/[id]/route.ts` only if required for missing fields

- [ ] **Step 1: Add failing e2e for full forms flow**

```ts
test('forms flow: site -> category -> subcategory -> submit', ...)
```

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test e2e/route-migration.spec.ts -g "forms flow"`
Expected: FAIL.

- [ ] **Step 3: Implement each step UI with route params + live data**

Rules:
- `site` step uses `/api/sites`.
- `category` step uses `/api/forms/categories`.
- `subcategory/new` use `/api/forms/categories/:id` and `POST /api/entries/dynamic`.

- [ ] **Step 4: Add endpoint unavailable banners per step**

- [ ] **Step 5: Re-run test**

Run: `npx playwright test e2e/route-migration.spec.ts -g "forms flow"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/app/forms e2e/route-migration.spec.ts
git commit -m "feat: complete nested forms flow with live api integration"
```

### Task 7: Admin Routes Migration (Analytics, Live Feed, Approvals, Expenses)

**Files:**
- Create: `app/app/admin/approvals/page.tsx`, `app/app/admin/expenses/page.tsx`
- Modify: `app/app/admin/analytics/page.tsx`, `app/app/admin/live-feed/page.tsx`

- [ ] **Step 1: Add failing e2e admin route checks**

```ts
test('admin approvals route renders and loads requests', ...)
test('admin expenses route renders aggregate expense list', ...)
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx playwright test e2e/route-migration.spec.ts -g "admin"`
Expected: FAIL.

- [ ] **Step 3: Implement `/app/admin/approvals` using live APIs**

Use:
- `GET /api/requests/resource`
- `PATCH /api/requests/resource/:id`
- `GET /api/requests/field`
- `PATCH /api/requests/field/:id`

- [ ] **Step 4: Implement `/app/admin/expenses` using live APIs**

Use:
- `GET /api/sites`
- `GET /api/sites/:id/entries?type=expense`

- [ ] **Step 5: Restyle existing analytics/live-feed pages to legacy look while retaining APIs**

- [ ] **Step 6: Run tests**

Run:
- `npm run lint`
- `npx playwright test e2e/route-migration.spec.ts -g "admin"`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/app/admin e2e/route-migration.spec.ts
git commit -m "feat: migrate admin routes to route-driven legacy ux"
```

### Task 8: Footer Nav and Deep-Link Behavior Finalization

**Files:**
- Modify: `components/app-shell/AppFooterNav.tsx`, `app/app/layout.tsx`
- Test: `e2e/route-migration.spec.ts`, `e2e/smoke.spec.ts`

- [ ] **Step 1: Add failing tests for active tab behavior + browser back/forward**

- [ ] **Step 2: Run test to verify failure**

Run: `npx playwright test e2e/route-migration.spec.ts -g "nav state"`
Expected: FAIL.

- [ ] **Step 3: Implement active route highlighting and role-based nav items**

Rules:
- Supervisor: Home, History/Sites, Quick Log, Requests, Settings.
- Admin: Home, Pulse, Quick Log, Expenses, Settings.

- [ ] **Step 4: Re-run tests**

Run:
- `npx playwright test e2e/route-migration.spec.ts -g "nav state"`
- `npx playwright test e2e/smoke.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/app-shell/AppFooterNav.tsx app/app/layout.tsx e2e/route-migration.spec.ts e2e/smoke.spec.ts
git commit -m "feat: finalize route-driven footer nav behavior"
```

### Task 9: Legacy State-Machine Decommission

**Files:**
- Modify or delete: `components/App.tsx`
- Modify: `app/app/dashboard/page.tsx`
- Test: `tests/migration/no-src-imports.test.ts`

- [ ] **Step 1: Add failing test asserting no dashboard dependency on legacy state-machine**

```ts
// Assert: dashboard page source does not contain \"@/components/App\" import.
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- tests/migration/no-src-imports.test.ts`
Expected: FAIL (after adding assertion).

- [ ] **Step 3: Remove usage and retire file**

Rules:
- Dashboard must be route-native component.
- Remove dead navigation branch logic.

- [ ] **Step 4: Re-run tests**

Run:
- `npm run test -- tests/migration/no-src-imports.test.ts`
- `npm run lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/App.tsx app/app/dashboard/page.tsx tests/migration/no-src-imports.test.ts
git commit -m "refactor: remove legacy in-memory app state machine"
```

### Task 10: Full Verification Gate

**Files:**
- Modify: files that fail verification commands in this task (no unrelated edits)

- [ ] **Step 1: Run full typecheck**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 2: Run unit tests**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 3: Run e2e suites**

Run:
- `npx playwright test e2e/smoke.spec.ts`
- `npx playwright test e2e/route-migration.spec.ts`

Expected: PASS.

- [ ] **Step 4: Manual QA checklist**

- Sign in/out works.
- Supervisor can create entries and requests.
- Admin can review approvals.
- Missing endpoint shows explicit endpoint banner.
- Footer nav works with browser back/forward.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: complete route-driven legacy ux migration"
```

---

## Definition of Done

- No in-memory `currentView` navigation drives production routes.
- All approved routes are URL-driven and deep-linkable.
- Forms flow is nested routes with guard redirects.
- Supervisor and Admin screens preserve old UI/UX style.
- Live APIs only; unavailable endpoint messaging is explicit.
- Lint, unit, and e2e checks pass.

## Known Risk Controls

- Keep small commits by task to simplify rollback.
- Preserve backend contracts; never change route URLs silently.
- Do not introduce client-side role trust beyond display logic.
- Avoid broad refactors outside migration scope.
