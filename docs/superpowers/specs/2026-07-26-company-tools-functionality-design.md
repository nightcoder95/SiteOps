# Company Tools Functionality Design & Implementation Plan

**Date:** 2026-07-26  
**Status:** Approved  
**Target Module:** `/app/app/tools` (Company Tools Page)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the Company Tools page (`/app/app/tools`) into an intuitive, high-performance tool management hub featuring simplified construction terminology ("Godown", "In Godown", "At Sites", "Send to Site", "Bring Back to Godown"), a hybrid view (All Tools & By Site views), an atomic single-operation management drawer, hidden internal tool codes, complete movement history logging, robust validation, security, and test coverage.

**Architecture:** Replace fragile client-side multi-tool batch saving with atomic single-tool transaction endpoints (`POST /api/tools/[id]/move`) backed by Drizzle ORM transactions. Create a responsive slide-over drawer component for tool actions (Send to Site, Bring Back, Transfer, Stock Intake, Damage Report) and a site-centric view tab for batch returning tools directly from sites.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, SWR (stale-while-revalidate data fetching), Drizzle ORM (PostgreSQL), Zod validation, Vitest (unit/API tests).

## Global Constraints
- Naming & Copy: Use simplified Kerala construction terms ("Godown", "In Godown", "At Sites", "Send to Site", "Bring Back to Godown", "Tool History", "Remove / Damaged").
- Tool Codes: Hide auto-generated codes (e.g., `TL-001`) from all user-facing UI screens.
- Security & Auth: Enforce `tool:read` capability for viewing and `tool:manage` / `admin` role for stock modifications and movements.
- Invariant: $\text{Total Stock} = \text{In Godown} + \sum (\text{Quantity at Sites})$.
- Error Handling: Return low-cardinality structured error codes (`INSUFFICIENT_GODOWN_STOCK`, `INVALID_SITE_RETURN`, `SITE_NOT_FOUND`, `EXCEEDS_ASSIGNED_QTY`) with localized toast messages.
- Performance: SWR mutate key revalidations targeted only at `/api/tools*` without full page reloads; optimistically reflect single-tool drawer updates.

---

## Part 1: Design Specification

### 1. Overview & Terminology
To suit site operations in Kerala and remove corporate jargon, the interface replaces technical terms with plain construction terminology:
- **Godown**: Replaces *Warehouse / Stock*.
- **In Godown**: Replaces *Free / Unassigned Stock*.
- **At Sites**: Replaces *Deployed / Assigned Stock*.
- **Add New Tools**: Replaces *Procure / Stock Intake*.
- **Send to Site**: Replaces *Dispatch / Assign*.
- **Bring Back to Godown**: Replaces *Return / Unassign*.
- **Remove / Damaged**: Replaces *Decommission / Retire*.
- **Tool History**: Replaces *Movement Ledger / Audit Log*.
- **Internal Codes**: Auto-generated internal codes (e.g. `TL-001`) are hidden from user-facing UI elements; tools are identified by Name and Category.

### 2. Page Architecture & Views

The main page (`/app/app/tools`) is structured into a clean **Hybrid View**:

#### 2.1 Header Summary (KPI Cards)
- **Total Tools**: Count of distinct tool types registered in the system.
- **In Godown**: Total number of physical tools currently available in the central godown.
- **At Sites**: Total number of tools currently distributed across active construction sites.

#### 2.2 Main View Tabs
1. **All Tools View (Default)**:
   - Tool card/row listing: Tool Name, Category Icon, **In Godown** count badge, **At Sites** summary badge (e.g. "3 at Site A, 2 at Site B").
   - Action Button: **`[ Manage ]`** — opens the slide-over drawer for single-tool operations.
   - Quick Add: **`[ + Add Tool ]`** button to create a new tool type in the godown.
2. **By Site View (Location-centric)**:
   - Grouped list of active construction sites.
   - Shows all tools currently assigned to each site, showing tool name, quantity at site, and days elapsed since assignment.
   - Quick Action: 1-click **`[ Bring Back to Godown ]`** per tool row on the site view.

### 3. Slide-Over Management Drawer

Clicking **Manage** on any tool opens a single-tool management drawer with clear, single-purpose action flows.

#### 3.1 Drawer Header
- **Tool Name** & Category
- **In Godown**: Count available for dispatch
- **At Sites**: Total count across sites

#### 3.2 Single-Operation Actions
- **Send to Site**:
  - Select Destination Site (Dropdown)
  - Enter Quantity (bounded: $1 \le qty \le \text{In Godown}$)
  - Optional Note (e.g. "Sent with driver Sasi")
  - Action: `Send to Site` (Executes immediate atomic backend update)
- **Bring Back to Godown**:
  - List sites currently holding this tool with assigned quantities.
  - Enter Quantity to return (bounded by quantity at selected site).
  - Action: `Bring Back to Godown`
- **Transfer Between Sites**:
  - Select *From Site* and *To Site*.
  - Enter Quantity.
  - Action: `Transfer Tools`
- **Stock Management (Admin)**:
  - **Add New Stock**: Add newly purchased tools directly to the Godown total.
  - **Mark Damaged / Lost**: Deduct damaged or lost tools from Godown stock.

#### 3.3 Tool History Tab (Audit Trail)
Displays a full chronological timeline of all movements for the selected tool:
- Timestamp (Date & Time)
- Action Type (e.g. "Added 5 to Godown", "Sent 2 to Trivandrum Site", "Brought 1 back from Kollam Site")
- User Name (Admin / Supervisor)
- Optional Notes

---

## Part 2: Implementation Plan & Tasks

### File Structure & Responsibilities

- Modify: [lib/tools/types.ts](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/lib/tools/types.ts) — Add movement action payload types, error codes, and simplified DTO definitions.
- Modify: [lib/validation/toolSchemas.ts](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/lib/validation/toolSchemas.ts) — Zod validation schemas for single tool movements (`send_to_site`, `return_to_godown`, `transfer_site`, `add_stock`, `remove_stock`).
- Modify: [lib/tools/manage.ts](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/lib/tools/manage.ts) — Server-side transaction logic for atomic movements and stock adjustments.
- Create: [app/api/tools/[id]/move/route.ts](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/app/api/tools/[id]/move/route.ts) — API endpoint for processing tool movements.
- Create: [app/api/tools/[id]/move/route.test.ts](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/app/api/tools/[id]/move/route.test.ts) — API tests for movement validations and invariants.
- Create: [components/tools/ToolDrawer.tsx](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/components/tools/ToolDrawer.tsx) — Slide-over drawer with Send to Site, Bring Back, Transfer, Stock Intake, and Tool History tabs.
- Create: [components/tools/BySiteView.tsx](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/components/tools/BySiteView.tsx) — Location-centric tab grouping tools by site with 1-click return buttons.
- Modify: [components/tools/ToolsHub.tsx](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/components/tools/ToolsHub.tsx) — Update header KPI cards, simplified terminology, tab switching ("All Tools" / "By Site"), and integration with `ToolDrawer`.
- Modify: [components/tools/ToolRow.tsx](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/components/tools/ToolRow.tsx) — Simplify row representation, remove tool code display, show "In Godown" & "At Sites" badges, and trigger `ToolDrawer`.

---

### Task 1: Movement Types and Zod Schema Validation

**Files:**
- Modify: [lib/tools/types.ts](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/lib/tools/types.ts)
- Modify: [lib/validation/toolSchemas.ts](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/lib/validation/toolSchemas.ts)
- Create: [lib/validation/toolSchemas.test.ts](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/lib/validation/toolSchemas.test.ts)

**Interfaces:**
- Consumes: Existing database schema `toolMovements`.
- Produces: `ToolMovementActionPayload`, `toolMovementSchema` Zod validation schema.

- [ ] **Step 1: Write failing unit test for tool movement validation**

```typescript
// lib/validation/toolSchemas.test.ts
import { describe, expect, it } from "vitest";
import { toolMovementSchema } from "./toolSchemas";

describe("toolMovementSchema", () => {
  it("validates send_to_site action", () => {
    const valid = toolMovementSchema.safeParse({
      kind: "send_to_site",
      targetSiteId: "site-123",
      quantity: 5,
      note: "Sent to Suresh",
    });
    expect(valid.success).toBe(true);
  });

  it("rejects non-positive quantity", () => {
    const invalid = toolMovementSchema.safeParse({
      kind: "send_to_site",
      targetSiteId: "site-123",
      quantity: 0,
    });
    expect(invalid.success).toBe(false);
  });

  it("requires targetSiteId for transfer_site", () => {
    const invalid = toolMovementSchema.safeParse({
      kind: "transfer_site",
      fromSiteId: "site-1",
      quantity: 2,
    });
    expect(invalid.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run lib/validation/toolSchemas.test.ts`  
Expected: FAIL with "toolMovementSchema is not defined" or similar.

- [ ] **Step 3: Implement movement schemas in `lib/validation/toolSchemas.ts`**

Add `toolMovementSchema` to `lib/validation/toolSchemas.ts` supporting `kind`: `"send_to_site" | "return_to_godown" | "transfer_site" | "add_stock" | "remove_stock"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/validation/toolSchemas.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit task 1**

Commit: `feat(tools): add tool movement types and zod validation schemas`

---

### Task 2: Atomic Server Movement Transaction Engine

**Files:**
- Modify: [lib/tools/manage.ts](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/lib/tools/manage.ts)
- Create: [app/api/tools/[id]/move/route.ts](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/app/api/tools/[id]/move/route.ts)
- Create: [app/api/tools/[id]/move/route.test.ts](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/app/api/tools/[id]/move/route.test.ts)

**Interfaces:**
- Consumes: `toolMovementSchema` from Task 1.
- Produces: `executeToolMovement(toolId, payload, userId)` returning fresh tool state and movement record.

- [ ] **Step 1: Write failing API route test**

```typescript
// app/api/tools/[id]/move/route.test.ts
import { describe, expect, it } from "vitest";

describe("POST /api/tools/[id]/move", () => {
  it("rejects unauthorized requests without session", async () => {
    // API mock check
  });

  it("prevents sending more tools to site than available in godown", async () => {
    // Insufficient stock validation check
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run app/api/tools/[id]/move/route.test.ts`  
Expected: FAIL (route does not exist yet).

- [ ] **Step 3: Implement `executeToolMovement` in `lib/tools/manage.ts` and POST route in `app/api/tools/[id]/move/route.ts`**

Execute inside `db.transaction()`:
1. Lock tool row for update.
2. Calculate current assigned total across sites.
3. Calculate current godown available stock: `free = totalQuantity - assigned`.
4. Validate action invariants:
   - For `send_to_site`: `quantity <= free`.
   - For `return_to_godown`: `quantity <= current_assignment_for_site`.
   - For `transfer_site`: `quantity <= current_assignment_for_fromSite`.
   - For `remove_stock`: `quantity <= free`.
5. Update `tool_assignments` table (upsert or decrement/delete if 0).
6. Update `tools` row (`totalQuantity` if add/remove stock).
7. Insert row into `tool_movements`.
8. Return updated tool status.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/tools/[id]/move/route.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit task 2**

Commit: `feat(tools): add atomic tool movement backend engine and API endpoint`

---

### Task 3: Single-Tool Slide-Over Drawer Component (`ToolDrawer`)

**Files:**
- Create: [components/tools/ToolDrawer.tsx](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/components/tools/ToolDrawer.tsx)
- Modify: [lib/client/tools.ts](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/lib/client/tools.ts) (add `useToolMovementMutation` helper)

**Interfaces:**
- Consumes: `ToolDTO`, `SiteOption[]`, `useToolMovements` hook.
- Produces: Interactive slide-over drawer with Send to Site, Bring Back to Godown, Transfer Between Sites, Add/Remove Stock, and Tool History tabs.

- [ ] **Step 1: Implement `ToolDrawer.tsx` UI & tab switching**
  - Render drawer header with Tool Name (without code), Category, "In Godown" count, and "At Sites" count.
  - Tab navigation: `[ Send to Site ]`, `[ Bring Back ]`, `[ Transfer ]`, `[ Manage Stock ]`, `[ Tool History ]`.
  - Form validation matching backend constraints.
  - SWR mutate revalidation on submit.

- [ ] **Step 2: Manual UI verification in dev server**
  - Trigger drawer from Tools page, execute a "Send to Site" action, check toast notification and immediate UI count update.

- [ ] **Step 3: Commit task 3**

Commit: `feat(tools): implement single-tool management drawer component`

---

### Task 4: Location-Centric "By Site" View (`BySiteView`)

**Files:**
- Create: [components/tools/BySiteView.tsx](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/components/tools/BySiteView.tsx)
- Modify: [components/tools/ToolsHub.tsx](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/components/tools/ToolsHub.tsx)

**Interfaces:**
- Consumes: `tools: ToolDTO[]`, `sites: SiteOption[]`, `onReturnToGodown(toolId, siteId, qty)`.
- Produces: Site-grouped list of tools with 1-click "Bring Back to Godown" action.

- [ ] **Step 1: Implement `BySiteView.tsx` component**
  - Group all assignments by site.
  - Display cards for each site listing: Tool Name, Quantity at Site, and a quick **"Bring Back to Godown"** button with quantity stepper.

- [ ] **Step 2: Connect view tab in `ToolsHub.tsx`**
  - Add tab toggle between **All Tools** and **By Site**.

- [ ] **Step 3: Commit task 4**

Commit: `feat(tools): add location-centric By Site view tab`

---

### Task 5: Simplified UI Terminology & Cleanup in `ToolsHub` and `ToolRow`

**Files:**
- Modify: [components/tools/ToolsHub.tsx](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/components/tools/ToolsHub.tsx)
- Modify: [components/tools/ToolRow.tsx](file:///Volumes/work/my_projects/SiteOps/SiteOps-Web/components/tools/ToolRow.tsx)

**Interfaces:**
- Consumes: Simplified Kerala terminology definitions ("Godown", "In Godown", "At Sites").
- Produces: Clean, code-free tool rows with "In Godown" and "At Sites" badges and a single `[ Manage ]` trigger button.

- [ ] **Step 1: Update terminology and hide tool code**
  - Replace "Warehouse", "Free", "Deployed" with "Godown", "In Godown", "At Sites".
  - Remove tool code (`tool.code`) rendering from `ToolRow.tsx` and `ToolsHub.tsx`.
  - Update top KPI cards to: **Total Tools**, **In Godown**, **At Sites**.

- [ ] **Step 2: Run automated end-to-end / unit tests**

Run: `npx vitest run`  
Expected: PASS

- [ ] **Step 3: Commit task 5**

Commit: `refactor(tools): apply simplified construction terms and hide internal tool codes`

---

## Part 3: Edge Cases, Security & Performance Audit

### 1. Concurrent Update Edge Cases
- **Race Condition**: Two admins simultaneously try to send the last 2 available drills to different sites.
- **Handling**: Row-level database locking (`FOR UPDATE`) on the `tools` row inside `executeToolMovement()` ensures the second transaction reads the updated `free` stock count (0) and fails safely with `INSUFFICIENT_GODOWN_STOCK`.

### 2. Zero-Quantity / Over-Return Edge Cases
- **Negative Stock**: Attempting to return 5 items from a site that only has 3.
- **Handling**: Backend query validates `assignments.qty >= returnQuantity`. If invalid, returns status `400 Bad Request` with message `"Cannot return more tools than currently assigned to site"`.

### 3. Security & Access Control Audit
- **Role Verification**: `tool:read` required to view lists; `tool:manage` required for movements; `admin` required for `add_stock` / `remove_stock`.
- **Sanitization**: All notes and text inputs are sanitized with HTML entity encoding and Zod string trimming.

### 4. Performance & Core Web Vitals Audit
- **Revalidation Overhead**: Replaces page-wide refetches with SWR key-targeted revalidations (`/api/tools*`).
- **Render Optimizations**: Tool list uses memoized site maps and simple badges to eliminate re-render lags.
