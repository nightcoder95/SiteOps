# Audit Remediation — Phase Plans (2026-08-06)

Implementation plans derived from [`docs/codebase-audit-2026-07-17.md`](../../docs/codebase-audit-2026-07-17.md).

Every claim in the source audit was re-verified against the working tree on **2026-08-06** (branch `main`, HEAD `09fd4a2`). Corrections are recorded in [Verification report](#verification-report) below and folded into each phase doc. **Do not implement from the original audit — implement from these phase docs**, which reflect the tree as it exists today.

---

## Phase index

| Phase | Doc | Scope (audit findings) | Ship size | Depends on |
|---|---|---|---|---|
| 1 | [phase-1-p0-user-facing.md](phase-1-p0-user-facing.md) | F1 validation messages, F2 last native dialog, F3 `inputMode`, F4 `resolveMaterialUnit` drift, F5 transfer unit picker | ~1 week | — |
| 2 | [phase-2-catalog-perf-and-route-hygiene.md](phase-2-catalog-perf-and-route-hygiene.md) | F6 catalog aggregate caching + optimistic client, F8 `assertSiteWritable` / `withAuthedApi` | ~1 week | Phase 1 (F5 touches units; F8 touches materials route also touched by F4) |
| 3 | [phase-3-entry-type-descriptor.md](phase-3-entry-type-descriptor.md) | F7 descriptor registry, F9 `entries.ts` switch collapse, F10 labour-spend unification, F18 field metadata SSOT | ~2 weeks, 4 independently shippable steps | Phase 2 (F8 lands first so route bodies are stable) |
| 4 | [phase-4-structural-cleanups.md](phase-4-structural-cleanups.md) | F11 review-flow extraction, F12 approvals split, F13 seam leak, F16 client→server pages | ~1.5 weeks | Phase 3 for F13 (descriptor owns `EntryType`) |
| 5 | [phase-5-performance-and-legibility.md](phase-5-performance-and-legibility.md) | F14 rate-limit RTT, F15 projection + pagination, F17 contrast & type floors | ~1 week | — (independent; can run parallel with 3/4) |
| 6 | [phase-6-dead-code-and-polish.md](phase-6-dead-code-and-polish.md) | F19 dead-code deletions, F20 polish batch | ~1 week | Phase 3 (F19 `mergeVisualEntries`/`entryCategoryKey` live in a file Phase 3 rewrites) |
| 7 | [phase-7-security-hardening.md](phase-7-security-hardening.md) | S1 CSP enforcing, S2 role fail-closed, S3 rate-limit fail-open, S4 global bucket, S5 HSTS | ~1 week | Phase 5 for S3/S4 (same file as F14) |

**Recommended order:** 1 → 2 → 3 → 4 → 6, with 5 and 7 slotted whenever there is a gap. Phases 5 and 7 both touch `lib/rateLimit/` — do F14 (Phase 5) before S3/S4 (Phase 7), or merge those three tasks into whichever lands first.

Appendix C of the audit (UX redesign vision) is **not** planned here. It is aspiration, not repair, and needs its own brainstorm + spec before any plan.

---

## Global constraints (apply to every phase, every task)

Copied verbatim from the audit's Appendix A.0 and re-verified today.

- **Never run `npm run db:migrate`.** It is a hard-failing stub (`package.json`). Prod is push-managed and `drizzle.__drizzle_migrations` is empty; running it would replay every migration. Schema changes = `npm run db:generate` + a reviewed, idempotent, txn-wrapped SQL file applied via `npm run db:apply -- <file>`.
- **No phase in this set requires a schema change.** If a task appears to need one, stop and escalate — it means the plan is wrong.
- **Verification loop:** `npm run lint` (= `tsc --noEmit -p tsconfig.lint.json`; there is no eslint in this repo) and `npm run test` (vitest). Baseline verified green on 2026-08-06 (`npm run lint` exit 0).
- **DB-backed tests flake at the 5s default under parallel load.** Always run `npm run test -- --testTimeout=30000` before declaring red or green. Affected: `lib/catalog/overviewQuery.test.ts`, `lib/db/queries/operationSummary.test.ts`, `lib/db/guard.test.ts`, `lib/db/queries/sites.spend.test.ts`, `lib/export/snapshot.test.ts`, `lib/backup/restoreSnapshot.test.ts`.
- **Do not change the API envelope.** All routes return `successResponse(data, status, requestId)` / `errorResponse(code, message, status, details?, requestId)` from `lib/errors/response.ts`, codes from `lib/errors/codes.ts`. Clients parse via `requestJson` (`lib/http/client.ts`) into `ClientResult<T>`. Route tests assert this shape.
- **Toast discipline.** `lib/ui/toast.ts` never surfaces raw backend strings. Exact signatures (verified):
  - `notifyError(result: ClientResult<unknown>, override?: string)` — takes a **`ClientResult`, not a string**.
  - `notifyGenericError(override?: string)` — the string escape hatch.
  - `toastSuccess(message: string)`, `toastClientError(result)`.
  New user-facing copy belongs in `lib/ui/toastMessages.ts` (has its own test).
- **`tests/migration/no-src-imports.test.ts` enforces import-path rules.** Any file move must keep it green. It walks `app/`, `components/`, `lib/` and asserts no `src/` imports — it does not enumerate specific paths, so moves inside those roots are safe.
- **`withApi` owns rate-limit + request-id + logging** for every route (`lib/http/withApi.ts:80`). `withApiRoute<TCtx>` (`:85`) is the dynamic-segment variant. Handlers receive `({ request, requestId }, ctx)`.
- **Auth guards** live in `lib/auth/guards.ts`: `getSessionFromRequest`, `requireCapability(request, capability)`, `requireAuth`, `requireAdmin`, `requireSiteAccess`. All header-based, no DB. Covered by `lib/auth/guards.test.ts`, `session.test.ts`, `ownership.test.ts`.
- **Commit granularity:** one commit per task, message in Conventional Commits form. Never batch two tasks into one commit — the review gate is per task.
- **Tech stack (verified):** Next 16.2.9 (App Router), React 19.2.5, drizzle-orm 0.45.2 + postgres 3.4.7, zod **4**.3.6, SWR 2.4.1, vitest 3, Playwright 1.50, Tailwind 4, motion 12, lucide-react 0.546, sonner 2.

---

## Protected behaviour — must not regress in any phase

The audit's "what is already good" list, re-verified. Treat each as an invariant with a named guard test.

| Invariant | Where | Guard |
|---|---|---|
| Identity headers stripped before every middleware exit path, re-set only from verified JWT claims | `proxy.ts` | `tests/proxy.test.ts` |
| Every API route calls an auth guard (59 of 61 route files; the 2 exceptions are the always-410 `auth/create-profile` stub and the catalog GET which uses `requireCapability` inline) | `app/api/**` | `lib/auth/guards.test.ts` + manual grep in each phase's regression checklist |
| Singleton pooled DB client, `prepare: false` | `lib/db/client.ts` | — (do not touch) |
| Zero-DB-round-trip auth from JWT claims | `lib/auth/session.ts` | `lib/auth/session.test.ts` |
| Single-round-trip SQL summaries | `lib/db/queries/entries.ts:510`, `sites.ts:46` | `operationSummary.test.ts`, `sites.spend.test.ts` |
| `withStatementTimeout` wraps catalog reads (pool-freeze fix) | `lib/db/guard.ts`, `app/api/admin/catalog/route.ts:18` | `lib/db/guard.test.ts` |
| CSV formula-injection neutralizer | `lib/export/serialize.ts:41-56` | `lib/export/serialize.test.ts` |
| `handleDbError` maps PG codes to friendly copy, logs raw detail server-side | `lib/errors/db.ts` | route tests |
| Double-submit protection on every mutation path | all forms | manual |
| Optimistic updates with rollback | `EntryLogList.tsx:98`, `CategoryPicker.tsx:141` | manual |
| `confirmDialog` is the only confirmation channel | `lib/ui/confirm.tsx` | Phase 1 adds a lint-style grep test |

---

## Verification report

Every audit claim was checked against HEAD `09fd4a2` on 2026-08-06. **Confirmed** = still true as written. **Corrected** = true in substance but the detail changed. **Wrong** = claim does not hold.

### Confirmed as written

- **F1** — `components/logs/EntryForm.tsx:229-233`: `validate()` returns a precise string, handler calls bare `notifyGenericError()`. Confirmed.
- **F3** — zero `inputMode` occurrences repo-wide. Confirmed by grep.
- **F4** — drift is real and live. Create route `app/api/entries/materials/route.ts:78-97` resolves to `null` → 400. Update route `app/api/entries/[id]/route.ts:181-197` falls back to `unitRule.preferredName`. Confirmed.
- **F5** — `components/transfers/TransferForm.tsx:217-218` renders a raw `placeholder="Unit UUID"` text input, `required`. Confirmed.
- **F6** — `app/api/admin/catalog/route.ts` has no `getOrSetJson`; `fetchUsageCounts` (`lib/catalog/overviewQuery.ts:21-30`) UNION-ALLs `count(*) GROUP BY` across all `USAGE_SOURCES` with no `site_id` filter. `CatalogManager.tsx` calls `mutate()` at lines 92, 129, 147, 190. Confirmed.
- **F7** — all ~11 encodings located at the stated files. Confirmed.
- **F9** — `lib/db/queries/entries.ts` is 710 lines; `switch (type)` at 320, 381, 428, 679; 5 `insert*`, 4 `findMatching*`, 4 `merge*`, 4 clone fetchers. Confirmed.
- **F11** — `resolveReviewSiteId` byte-identical in `categories/route.ts:24-50` and `subcategories/route.ts`. Routes are 227 / 224 lines. Confirmed.
- **F13** — `components/logs/UnitSelect.tsx:5` imports **runtime** helpers `dedupeUnitOptionsByName, displayUnitName` from `@/lib/db/queries/materialUnits`. `EntryType` declared at `lib/db/queries/entries.ts:302`. Confirmed — but see the mitigating detail under *Corrected #10*.
- **F14** — `lib/rateLimit/guard.ts:31` awaits `upstashRateLimit.limit(key)` unconditionally in production, inside `withApi` for every route. `lib/rateLimit/upstash.ts` constructs `Ratelimit` with **no `ephemeralCache`** — the one-line fix is available. Confirmed.
- **F15** — `getEntriesBySite` uses `db.select()` (SELECT *) in all four fetchers; operations page passes `limit: 200` per type at `page.tsx:76,128`; `AllOperationsPageClient.tsx:172` calls `router.refresh()` after an optimistic delete. Confirmed.
- **F16** — exactly 9 `page.tsx` files under `app/app` carry `'use client'`: `admin/expenses`, `admin/live-feed`, `admin/users`, `admin/approvals`, `admin/analytics`, `requests/field`, `requests/resource`, `profile`, `notifications`. Confirmed.
- **F17** — `.input-standard` at `app/globals.css:129-131` uses `placeholder-slate-600`. Confirmed.
- **F19** — `mergeVisualEntries` (`entryFormat.tsx:127`) zero callers; `entryCategoryKey` (`:174`) zero callers (one comment mention only); `catalogNounForCategory` (`lib/catalog/addCta.ts:16`) test-only; `lib/db/migrations/schema.ts` (10 155 B) and `relations.ts` (81 B) imported nowhere and not referenced by `drizzle.config.ts`. Confirmed.
- **S1** — CSP ships as `Content-Security-Policy-Report-Only` with `script-src 'self' 'unsafe-inline' 'unsafe-eval'` (`next.config.ts:9-19,32`). Confirmed.
- **S2** — `lib/auth/session.ts:33`: `parseSessionRole(...) ?? ROLES.SUPERVISOR`. Confirmed.
- **S3** — `lib/rateLimit/guard.ts:16-17` returns `null` when `NODE_ENV !== "production"` **or** when `upstashRateLimit` is null; unauthenticated key uses first `x-forwarded-for` entry. Confirmed.
- **S4** — key is `user:${userId}:${pathname}` (`guard.ts:23`). Confirmed.
- **S5** — no `Strict-Transport-Security` in `next.config.ts` `securityHeaders`. Confirmed.

### Corrected

1. **F2 is ~80 % already fixed.** Four of the five call sites now use `confirmDialog`: `EntryForm.tsx:262`, `CategoryPicker.tsx:139`, `SubcategoryCombobox.tsx:155`, `ToolCatalogManager.tsx:85,97`. **The only remaining native dialog in the repo is `window.prompt` at `components/tools/ToolCategoryManager.tsx:47`.** A purpose-built `components/catalog/RenameModal.tsx` already exists (its header comment literally says "replaces window.prompt"), so the fix is a drop-in, not a new component. Phase 1 scopes F2 accordingly and adds a regression grep test so it cannot come back.
2. **`getOrSetJson` signature in the audit is wrong.** Actual: `getOrSetJson<T>(requestId: string, key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<{ value: T; hit: boolean }>` (`lib/cache/getOrSetJson.ts:5`). The audit wrote `getOrSetJson<T>(key, ttl, fn)`. Phase 2 uses the real signature.
3. **F6's invalidation targets are not under `app/api/admin/catalog/*`.** Catalog mutations from `CatalogManager` hit `/api/forms/subcategories/{id}` (toggle, rename, reorder — `CatalogManager.tsx:82,116,121`), `/api/forms/subcategories` (create — `:174`), and `/api/admin/catalog/merge` (`:135`). Only two route files exist under `app/api/admin/catalog/` (the GET and `merge`). `invalidateCategoryListCache` is currently called from `app/api/forms/categories/route.ts` and `categories/[id]/route.ts` **only** — the subcategory routes do not invalidate anything today. Phase 2 lists the exact four write routes.
4. **F10 undercounts: the labour formula exists in 5 places, not 4, and one of them is already canonical.** Verified: `calculateLabourTotal` (`lib/db/queries/operationTotals.ts:46`, canonical TS, tested at `entries.test.ts:18-33`); `entrySpend` (`components/operations/entryFormat.tsx:103-110`, duplicate TS); SQL `labourSpendExpr` (`entries.ts:517-522`); SQL in `lib/db/queries/sites.ts:44`; SQL in `lib/db/queries/search.ts:101`. The audit's fourth citation — `app/api/entries/labour/route.ts:37-42` — is the **write-side** `salaryAmount` derivation, a different concern that must not be folded into a read-side spend helper. Phase 3 handles all five correctly.
5. **F8's guard count is 59, not 58**, out of 61 total `route.ts` files.
6. **F12's state count is 8 `useState` + 3 `useOptimistic`**, not 9 + 4 (`app/app/admin/approvals/page.tsx:48-77`). The structural argument is unchanged.
7. **F17's micro-text count is 98**, not 26 (`text-[9px]` / `text-[10px]` across `components/` + `app/`). This makes a blanket bump a much larger visual change than the audit implies. Phase 5 fixes only the 8 user-critical sites and adds the type floor as a documented token, leaving decorative chips alone.
8. **F20's `DataExportPanel` lives at `components/data-export/DataExportPanel.tsx:171`**, not `components/export/`. The `z-30` under-`z-50` bug is real and there is a **second** instance: `components/catalog/RowActionsMenu.tsx:68`. Full z-scale in use: `z-10`, `z-30` (×2), `z-50` (×4), `z-[60]` (×4), `z-[70]`, `z-[90]`, `z-[1000]` (confirm dialog).
10. **F13's "sharpest leak" is a path problem, not a bundle problem.** `lib/db/queries/materialUnits.ts:1-3` opens with a comment stating it is deliberately pure and client-safe, and the file imports nothing from the DB client — the DB-backed lookup was already split out into `materialUnitRule.ts` (server-only). So `UnitSelect` is **not** pulling Drizzle into the client bundle today. What remains is a naming/locality defect: a client-safe module lives under a `db/queries/` path, which invites the next person to add a DB import to it and silently break the bundle. Phase 4 treats F13 as a rename-and-relocate with a re-export shim, priority accordingly lowered from "sharpest leak" to "fence before someone falls in".
11. **Appendix A.0's "coordinate with ~30 uncommitted files" warning is stale.** The global-work-stage work landed in commit `4c069c8`. The tree today is clean except `public/sw.js` (a Serwist build artifact, staged). **F7/Phase 3 is unblocked.**

### Wrong

1. **A.2 claims `app/api/entries/materials/route.ts` has a route test — it does not.** Verified list of entry route tests: `labour/route.test.ts`, `machinery/route.test.ts`, `expenses/route.test.ts`, `[id]/route.test.ts`. **There is no `materials/route.test.ts`.** Since F4 changes the materials create route, Phase 1 must **write that test first** — this is the single largest coverage gap in the P0 batch.
2. **A.1's F4 note that `entries/[id]/route.test.ts` "may pin the fallback behaviour" — it does not.** That file is 93 lines and tests only `workStage` catalog canonicalisation on PATCH (`describe("PATCH entries — workStage catalog checks")`). No test asserts the unit fallback, so the F4 behavioural decision is unconstrained by existing tests.
3. **A.1's F18 note about reading zod `_def` assumes zod 3.** The repo is on **zod 4.3.6**, whose internals differ again. The note's *conclusion* (prefer descriptor-owned constants over runtime introspection) is right and is what Phase 3 does — but do not attempt `_def` reading at all.

### Not re-verified (inherited from the audit as-is)

- Index coverage claims (composite `(site_id, date DESC, created_at DESC)`, partial unread/active, trigram GIN) — schema not read in this pass.
- `npm audit` posture — run `npm run audit:ci` in CI as the audit suggests.
- Supabase RLS posture — still worth the one-time confirmation the audit's B.2 asks for.
- Playwright e2e green/red state — `e2e/` contains `smoke.spec.ts`, `route-migration.spec.ts`, `tools-inventory.spec.ts` (file presence confirmed; not executed).

---

## How to run a phase

1. Read the phase doc top to bottom before touching code.
2. Create a branch: `git checkout -b phase-N-<slug>`.
3. Work tasks in order. Each task is TDD: failing test → run it red → minimal implementation → run it green → commit.
4. After every task, run the task's stated verification commands. Do not proceed on a red suite.
5. At phase end, run the phase's **Regression checklist** in full — it is not optional, and it is what protects the invariants table above.
6. Tick the checkboxes in the doc as you go; the doc is the working record.
