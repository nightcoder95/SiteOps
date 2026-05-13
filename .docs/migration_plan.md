# Next.js Migration & /src Retirement Plan

This document details the step-by-step engineering plan to migrate the high-fidelity UI/UX from the prototype `/src` folder into the main Next.js `/app` router, hook up live PostgreSQL database connections via existing REST APIs, and completely remove the retired `/src` directory and its associated Vite configurations.

---

## 🏗️ 1. Architectural Strategy

The application currently suffers from a dual state:
*   **The Prototype `/src`:** Beautiful industrial style, custom micro-interactions, responsive design, and smooth sliding navigation. However, it relies entirely on local `useState` mock states.
*   **The Next.js Route Build `/app`:** Clean filesystem routes, complete session security, and functional Postgres database handlers, but lacking standard visual layouts (plain HTML wireframes).

To achieve a **production-ready, visually stunning, and highly secure** solution, we will migrate all gorgeous view components into standard Next.js folders and rewire them to use the live backend APIs.

### 💡 "What Would Mark Zuckerberg Do?"
*   **Eliminate Bloat & Move Fast:** Maintaining two parallel frontend code structures is slow and error-prone. We will completely retire the `/src` folder and unify everything under `/app` and `/components`.
*   **Preserve UI Magic:** The original SPA views feel like a high-performance native app because of in-memory routing transitions. Instead of forcing hard page reloads across separate Next.js pages, we will wrap the layout in a unified dashboard frame. This maintains the gorgeous fixed footer navbar, floating action triggers, and slick headers while fetching live database results as standard React Client Components.

---

## 📋 2. Complete Phase-by-Phase Checklist

### Phase 1: File Relocation and Structural Merge
- [ ] **Create Component Folders:**
  - Create `/components/views/` and `/components/constants/` under the repository root.
- [ ] **Move SPA Components:**
  - Copy all views from `src/components/views/*` into `components/views/*`.
  - Copy custom Lucide helper constants from `src/constants/*` into `components/constants/*`.
- [ ] **Unify TypeScript Types:**
  - Relocate legacy view types from `src/types.ts` into a dedicated file at `lib/types/legacy.ts` or `components/views/types.ts`.
  - Fix import statements in all relocated components to point to relative alias paths: `@/components/...` or `@/lib/...`.
- [ ] **Merge Tailwind CSS v4 Themes:**
  - Extract the `@theme` palette (Space Grotesk typography, construction orange accent colors, layout radial gradients, glassmorphism templates, active pressing modifiers) from `src/index.css`.
  - Paste and integrate these variables directly into [app/globals.css](file:///Volumes/work/my_projects/SiteOps/app/globals.css).
  - Streamline [app/globals.css](file:///Volumes/work/my_projects/SiteOps/app/globals.css) to remove any conflicting legacy wireframe styles.

### Phase 2: Live Database API Integrations
Instead of static arrays, the components will run live asynchronous requests to your database endpoints:

- [ ] **HomeView / Site Selection (`/app/app/dashboard/` & `/app/app/sites/`):**
  - Hook up client-side `fetch('/api/sites')` queries within a React `useEffect` to retrieve live user sites.
  - Dynamically display sites, counts, and descriptions.
- [ ] **Worksite Dashboard View (`/app/app/sites/[id]/`):**
  - Extract the `id` string using Next.js `useParams()`.
  - Query live logged items from `/api/sites/[id]/entries` (labour hours, machinery schedules, materials stocks, expense transactions).
  - Map the response records to the high-fidelity visualization cards.
- [ ] **Dynamic Entry Submission Forms (`/app/app/forms/`):**
  - Integrate the form sheets (Labour, Materials, Machinery, Expenses, Incidents).
  - Bind form action buttons to POST submissions:
    * Labour Form ➡️ `/api/entries/labour`
    * Material Form ➡️ `/api/entries/materials`
    * Machinery Form ➡️ `/api/entries/machinery`
    * Expense Form ➡️ `/api/entries/expenses`
    * Incident Form ➡️ `/api/entries/incidents`
  - Ensure correct validation and error handling (using low-cardinality error logs).
- [ ] **Notifications & Broadcasts (`/app/app/notifications/`):**
  - Hook up `NotificationsView` to query list payloads from `/api/notifications`.
  - Implement read-marking patches via `PATCH /api/notifications` or `/api/notifications/[id]`.
- [ ] **Resource Requests (`/app/app/requests/resource/`):**
  - Connect listing and posting actions directly to `/api/requests/resource`.
- [ ] **User Sessions & Settings (`/app/app/profile/`):**
  - Read profile states from the active session context or `/api/users/profile`.

### Phase 3: Premium App Layout & Root Navigation
- [ ] **Overhaul Next.js Root Layout (`app/app/layout.tsx`):**
  - Wrap the Next.js `{children}` with the gorgeous sticky header and the fixed bottom floating footer navbar (`GlobalFooter`).
  - Map bottom-nav button clicks directly to active Next.js route transitions (`router.push`):
    * **Home** Button ➡️ `/app/dashboard`
    * **History** Button ➡️ `/app/sites`
    * **Quick Log (+)** Trigger ➡️ `/app/forms`
    * **Pulse** Button ➡️ `/app/admin/live-feed` (or analytics)
    * **Settings** Button ➡️ `/app/profile`
- [ ] **Handle Safe Mobile Margins:**
  - Add standard CSS safe padding bounds (`pb-[calc(env(safe-area-inset-bottom)+5rem)]`) to ensure elements are not hidden by mobile notches.

### Phase 4: Complete Retirement of /src & Vite Configs
- [ ] **Decommission Folder:**
  - Safely delete the `/src/` folder recursively.
- [ ] **Decommission Conf configurations:**
  - Delete `index.html` at the project root.
  - Delete `vite.config.ts`.
- [ ] **Align TypeScript Compile Targets:**
  - Update `tsconfig.json` and `tsconfig.lint.json` to monitor the folders `components/**/*`, `app/**/*`, and `lib/**/*` for type verification, completely ignoring `/src`.

---

## 🛡️ 3. Security Hardening Checklist

After completing the migration, we will review all code to ensure production-grade security:
1.  **Zero Exposed Secrets:** Verify no hardcoded dev database logins, API keys, or JWT tokens exist in client files.
2.  **No Direct State Mutating:** Ensure all requests flow through Next.js middleware checking Better Auth headers.
3.  **No Vulnerabilities:** Ensure all user inputs in form views are sanitized and validated against their target Zod schemas in API endpoints to mitigate XSS or Injection threats.

---

## 🧪 4. Testing & Verification

1.  **TypeScript Verification:** Run `npm run lint` to ensure zero compilation or build errors.
2.  **End-to-End Route Check:** Execute `npm run test:e2e` (Playwright suite) to verify standard redirect routes.
3.  **Manual Verification:** Check data insertion by adding new items inside the visual panel and making sure they correctly persist in PostgreSQL on reload.
