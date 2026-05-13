# SiteOps Backend Architecture & Design Specification

**Date:** 2026-04-24  
**Project:** SiteOps (Construction Site Operations Platform)  
**Scope:** Full-stack migration from React SPA to Next.js + PostgreSQL backend  
**Timeline:** Phase-based, self-paced implementation  
**Deployment:** Vercel (Free tier → paid as needed)  

---

## 1. Executive Summary

SiteOps is transitioning from a React SPA prototype to a production-ready full-stack application. This spec defines the backend architecture (Next.js API routes), database schema (PostgreSQL via Neon), authentication (Better Auth), and operational patterns for Phase 1 (Infrastructure), Phase 2 (Caching), and Phase 3 (Real-time).

**Key Design Principles:**
- Single Responsibility: Each file/function does one thing
- Phased Implementation: Infrastructure → APIs → Caching → Real-time
- Production-Ready: Error handling, validation, logging from Phase 1
- Serverless-Aware: Optimized for Vercel's constraints (300s timeout, isolated invocations)
- Data Integrity: Database-enforced constraints + application-level validation

**Success Criteria:**
- All APIs operational with consistent error handling
- Database schema supports all UI views; aggregates computed at query time where appropriate, cached in Phase 2
- Long-polling live feed functional within Vercel's timeout constraints
- Single developer can deploy and maintain without external tooling

---

## 2. Technology Stack

| Layer | Technology | Version | Reason |
|---|---|---|---|
| **Framework** | Next.js App Router | 15+ | Full-stack SSR, API routes, built-in middleware |
| **Runtime** | Node.js | 20+ | Vercel native support |
| **ORM** | Drizzle | Latest | Lightweight, serverless-friendly, TypeScript-first |
| **Database** | PostgreSQL (Neon) | Latest | Managed, free tier, Singapore region (latency) |
| **Auth** | Better Auth | Latest | Passwordless + email/password, Drizzle adapter, built-in brute-force protection |
| **Validation** | Zod | 3.x | Schema validation, type inference |
| **HTTP Client** | Neon HTTP adapter | Latest | Serverless-safe, no persistent TCP connections |
| **Caching** (Phase 2) | Upstash Redis | Latest | HTTP-based, serverless-friendly, Mumbai region |
| **Analytics** | PostHog (`@posthog/next`) | Latest | Event capture, session replay, exception autocapture |
| **PWA** | `@serwist/next` | Latest | Next.js official recommendation; App Router native; TypeScript; actively maintained Workbox fork |
| **Logging** | Console (JSON) | Native | Vercel log parsing, Phase 2 → Datadog/Sentry |
| **Styling** | Vanilla CSS (existing) | - | Reuse from React app |
| **UI Components** | Framer Motion (existing) | - | Reuse from React app |

---

## 3. Database Schema & Data Model

### 3.1 Core Tables

**Note:** Better Auth auto-manages `users` and `sessions` tables. You define only the tables below, plus `user_profiles` (extends `users`).

#### Identity & Access Management

**`user_profiles`** (Extends Better Auth's `users` table)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
userId UUID NOT NULL UNIQUE (FK → users.id)
phone VARCHAR(20)
assignedRegion VARCHAR(100)
designation VARCHAR(100)
createdAt TIMESTAMP DEFAULT NOW()
updatedAt TIMESTAMP DEFAULT NOW()
```

#### Project Infrastructure

**`sites`** (Construction projects)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
name VARCHAR(255) NOT NULL
location VARCHAR(255) NOT NULL
status site_status NOT NULL DEFAULT 'In Progress'  -- enum: In Progress, Blocked, Completed
budget DECIMAL(15,2) NOT NULL
currentProgress INT DEFAULT 0  -- 0-100%, manually entered milestone
currentPhase VARCHAR(100)
supervisorId UUID NOT NULL (FK → users.id)
archivedAt TIMESTAMP  -- NULL = active; set to soft-delete a site (preserves entry history + FK integrity)
createdAt TIMESTAMP DEFAULT NOW()
updatedAt TIMESTAMP DEFAULT NOW()

UNIQUE(name)
INDEX ON (supervisorId)
INDEX ON (status)
INDEX ON (archivedAt)
```

**Note:** `total_spend` and `total_headcount` are **not** stored. Compute at query time via aggregates.

#### Operational Entry Logs (The "Big Four")

**`labourEntries`**
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
siteId UUID NOT NULL (FK → sites.id)
date DATE NOT NULL
workType VARCHAR(100) NOT NULL  -- e.g., Steelwork, Plumbing
peopleCount INT NOT NULL  -- > 0, < 10000
remarks TEXT
createdBy UUID NOT NULL (FK → users.id)
createdAt TIMESTAMP DEFAULT NOW()
updatedAt TIMESTAMP DEFAULT NOW()

INDEX ON (siteId, date)
INDEX ON (createdBy)
```

**`materialEntries`**
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
siteId UUID NOT NULL (FK → sites.id)
date DATE NOT NULL
materialType VARCHAR(100) NOT NULL  -- e.g., Cement, M-Sand
quantity DECIMAL(12,2) NOT NULL  -- > 0, <= 1000000
unit VARCHAR(50) NOT NULL  -- e.g., Bags, Tons
remarks TEXT
createdBy UUID NOT NULL (FK → users.id)
createdAt TIMESTAMP DEFAULT NOW()
updatedAt TIMESTAMP DEFAULT NOW()

INDEX ON (siteId, date)
INDEX ON (createdBy)
```

**`machineryEntries`**
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
siteId UUID NOT NULL (FK → sites.id)
date DATE NOT NULL
equipmentType VARCHAR(100) NOT NULL  -- e.g., Excavator, Tower Crane
count INT NOT NULL  -- > 0
hoursActive DECIMAL(8,2) NOT NULL  -- > 0
remarks TEXT
createdBy UUID NOT NULL (FK → users.id)
createdAt TIMESTAMP DEFAULT NOW()
updatedAt TIMESTAMP DEFAULT NOW()

INDEX ON (siteId, date)
INDEX ON (createdBy)
```

**`expenseEntries`**
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
siteId UUID NOT NULL (FK → sites.id)
date DATE NOT NULL
description VARCHAR(500) NOT NULL
amount DECIMAL(12,2) NOT NULL  -- > 0, < 1000000
category expense_category NOT NULL  -- enum: Labour, Materials, Equipment, Misc
createdBy UUID NOT NULL (FK → users.id)
createdAt TIMESTAMP DEFAULT NOW()
updatedAt TIMESTAMP DEFAULT NOW()

INDEX ON (siteId, date)
INDEX ON (category)
INDEX ON (createdBy)
```

#### Governance & Requests

**`resourceRequests`** (Supervisor → Admin resource acquisition)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
siteId UUID NOT NULL (FK → sites.id)
requestType resource_type NOT NULL  -- enum: Labour, Materials, Money, Machinery
details TEXT NOT NULL  -- 10-1000 chars
reason TEXT NOT NULL  -- 10-500 chars, explains why
status request_status NOT NULL DEFAULT 'Pending'  -- enum: Pending, Approved, Declined
requestedBy UUID NOT NULL (FK → users.id)
approvedBy UUID (FK → users.id, nullable)
createdAt TIMESTAMP DEFAULT NOW()
updatedAt TIMESTAMP DEFAULT NOW()

INDEX ON (siteId, status)
INDEX ON (requestedBy)
INDEX ON (status)
```

**`fieldRequests`** (Supervisor → Admin field addition proposals)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
-- siteId is context-only (which site prompted the proposal). Approved fieldDefinitions
-- are global (linked to subcategoryId, not to a site) — they apply to ALL sites.
siteId UUID NOT NULL (FK → sites.id)
proposedName VARCHAR(100) NOT NULL
categoryId UUID NOT NULL (FK → categories.id)
subcategoryId UUID (FK → subcategories.id, nullable)
fieldType field_type NOT NULL  -- enum: Number, Text, Dropdown
status request_status NOT NULL DEFAULT 'Pending'  -- enum: Pending, Approved, Declined
requestedBy UUID NOT NULL (FK → users.id)
createdAt TIMESTAMP DEFAULT NOW()
updatedAt TIMESTAMP DEFAULT NOW()

INDEX ON (siteId)
INDEX ON (status)
INDEX ON (requestedBy)
```

#### Safety & Communication

**`incidentReports`** (Safety violations, site blockages)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
siteId UUID NOT NULL (FK → sites.id)
incidentType incident_type NOT NULL  -- enum: Safety, Block
severity severity NOT NULL DEFAULT 'Low'  -- enum: Low, Medium, High, Critical
description TEXT NOT NULL
durationEstimate INT  -- minutes (nullable, only for Block type)
reportedBy UUID NOT NULL (FK → users.id)
createdAt TIMESTAMP DEFAULT NOW()
updatedAt TIMESTAMP DEFAULT NOW()

INDEX ON (siteId)
INDEX ON (incidentType)
INDEX ON (reportedBy)
```

**`notifications`** (System-wide alerts)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
userId UUID NOT NULL (FK → users.id)
type notification_type NOT NULL  -- enum: approval, budget_alert, incident, system
title VARCHAR(255) NOT NULL
message TEXT NOT NULL
readAt TIMESTAMP  -- NULL = unread; set when user reads the notification
linkToView VARCHAR(255)  -- e.g., /app/dashboard/site-123
createdAt TIMESTAMP DEFAULT NOW()

INDEX ON (userId, readAt)
INDEX ON (createdAt)
```

**Notification Triggers** — server-side inserts via `createNotification()` at the end of the relevant route handlers:

| Event | Notified | Type |
|---|---|---|
| Resource request submitted | All Admins | `approval` |
| Request approved / declined | Requesting Supervisor | `approval` |
| Incident reported | All Admins | `incident` |
| Site budget > 80% spent | All Admins + Site Supervisor | `budget_alert` |

Implementation: `/lib/db/queries/notifications.ts` → `createNotification(userId, type, title, message, linkToView?)` — a plain DB insert, no separate service.

**Budget alert trigger location** — runs inside `POST /api/entries/expenses` after a successful insert. Reuse the site record already fetched for the ownership check:
```ts
// After successful expense insert in the POST /api/entries/expenses handler:
const totalSpend = await getSiteTotalExpenses(siteId); // one aggregate query
if (Number(totalSpend) / Number(site.budget) >= 0.8) {
  await notifyBudgetThreshold(siteId, site.supervisorId, totalSpend, site.budget);
  // notifyBudgetThreshold calls createNotification() for all Admins + the Supervisor
}
```
`getSiteTotalExpenses(siteId)` lives in `/lib/db/queries/sites.ts` — a single `SUM(amount)` aggregate query on `expenseEntries` for that site.

**Incident notification trigger location** — runs inside `POST /api/entries/incidents` after a successful insert:
```ts
// After successful incident insert in POST /api/entries/incidents:
const admins = await getAllAdmins(); // /lib/db/queries/notifications.ts
await Promise.all(
  admins.map(admin =>
    createNotification(
      admin.id,
      'incident',
      `Incident at ${site.name}`,
      description,
      `/app/sites/${siteId}`
    )
  )
);
```
`getAllAdmins()` lives in `/lib/db/queries/notifications.ts` alongside `createNotification()` — a single `SELECT` on `users` where `role = 'Admin'`.

#### Master Dictionary (Dynamic Forms)

**`categories`** (Top-level entry types)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
name VARCHAR(100) NOT NULL UNIQUE
icon VARCHAR(50)
createdAt TIMESTAMP DEFAULT NOW()

-- Pre-populated: Labour, Materials, Machinery, Expenses, Safety
```

**`subcategories`** (Groups of fields within a category)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
categoryId UUID NOT NULL (FK → categories.id)
name VARCHAR(100) NOT NULL
createdAt TIMESTAMP DEFAULT NOW()

UNIQUE(categoryId, name)
INDEX ON (categoryId)
```

**`fieldDefinitions`** (Individual form fields)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
subcategoryId UUID NOT NULL (FK → subcategories.id)
label VARCHAR(100) NOT NULL
fieldType field_type NOT NULL  -- enum: Number, Text, Dropdown
unit VARCHAR(50)  -- e.g., Bags, Hours, INR (nullable)
options JSONB  -- for Dropdown: ["Option1", "Option2"] (nullable)
createdAt TIMESTAMP DEFAULT NOW()

INDEX ON (subcategoryId)
```

**`genericEntries`** (Data for dynamic form submissions)
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
siteId UUID NOT NULL (FK → sites.id)
date DATE NOT NULL
fieldDefinitionId UUID NOT NULL (FK → fieldDefinitions.id)
value JSONB NOT NULL  -- Flexible: stores any type (number, string, boolean)
createdBy UUID NOT NULL (FK → users.id)
createdAt TIMESTAMP DEFAULT NOW()

INDEX ON (siteId, fieldDefinitionId)
INDEX ON (createdBy)
```

### 3.2 PostgreSQL Enums (Native Type Safety)

```ts
// /lib/db/schema.ts
export const siteStatusEnum = pgEnum('site_status', [
  'In Progress',
  'Blocked',
  'Completed',
]);

export const requestStatusEnum = pgEnum('request_status', [
  'Pending',
  'Approved',
  'Declined',
]);

export const expenseCategoryEnum = pgEnum('expense_category', [
  'Labour',
  'Materials',
  'Equipment',
  'Misc',
]);

export const resourceTypeEnum = pgEnum('resource_type', [
  'Labour',
  'Materials',
  'Money',
  'Machinery',
]);

export const incidentTypeEnum = pgEnum('incident_type', [
  'Safety',
  'Block',
]);

export const severityEnum = pgEnum('severity', [
  'Low',
  'Medium',
  'High',
  'Critical',
]);

export const notificationTypeEnum = pgEnum('notification_type', [
  'approval',
  'budget_alert',
  'incident',
  'system',
]);

export const fieldTypeEnum = pgEnum('field_type', [
  'Number',
  'Text',
  'Dropdown',
]);

export const userRoleEnum = pgEnum('user_role', [
  'Admin',
  'Supervisor',
]);
```

### 3.3 Drizzle ORM Structure

```
/lib/db/
  ├── client.ts           # Neon HTTP adapter + Drizzle instance (for API routes)
  ├── client.ws.ts        # Neon WebSocket adapter (for scripts/migrations only)
  ├── schema.ts           # All table definitions + native enums
  ├── queries/            # Query abstraction layer (Phase 1 onwards)
  │   ├── sites.ts        # getSiteById(), getSitesBySupervisor(), getSiteTotalExpenses(), etc.
  │   ├── entries.ts      # getEntriesBySite(), insertLabourEntry(), etc.
  │   ├── liveFeed.ts     # getActivitySince(since: Date, limit?: number) — UNION ALL across all entry tables
  │   └── notifications.ts # getNotificationsForUser(), createNotification(), getAllAdmins()
  └── migrations/         # Auto-generated by drizzle-kit
```

**`drizzle.config.ts` (project root):**
```ts
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local");
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
```

**Why two clients?**  
- `client.ts` uses Neon's HTTP adapter (`@neondatabase/serverless`). Zero persistent connections, perfect for Vercel's stateless invocations.
- `client.ws.ts` uses Neon's WebSocket adapter. For local migrations only (`drizzle-kit migrate`). Using WS client in Vercel functions causes connection hangs.

---

## 4. API Architecture & Route Structure

### 4.1 REST Endpoints (Organized by Resource)

**Authentication (Better Auth)**
```
POST   /api/auth/sign-up           → Better Auth handler
POST   /api/auth/sign-in           → Better Auth handler
POST   /api/auth/sign-out          → Better Auth handler
GET    /api/auth/session           → Better Auth handler
```

**Sites**
```
GET    /api/sites                  → List sites (Supervisor: own, Admin: all; excludes archivedAt IS NOT NULL by default)
POST   /api/sites                  → Create site (Admin only)
GET    /api/sites/[id]             → Get site details
PATCH  /api/sites/[id]             → Update site (Admin only)
DELETE /api/sites/[id]             → Soft-delete site (Admin only) — sets archivedAt = NOW(), preserves all entry history
```

**Entries (Big Four + Incidents)**
```
POST   /api/entries/labour         → Create labour entry
POST   /api/entries/materials      → Create material entry
POST   /api/entries/machinery      → Create machinery entry
POST   /api/entries/expenses       → Create expense entry (triggers budget alert check after insert)
POST   /api/entries/incidents      → Report incident
GET    /api/sites/[id]/entries     → [id] = siteId; query params: type (required: labour|material|machinery|expense|incident|all), from (ISO date, optional), to (ISO date, optional)
PATCH  /api/entries/[id]           → [id] = entryId; query param: type (required: labour|material|machinery|expense|incident) to route to correct table
DELETE /api/entries/[id]           → [id] = entryId; query param: type (required) to identify table
```
**Note:** GET is on `/api/sites/[id]/entries` (not `/api/entries/[id]`) to avoid a URL collision where `[id]` would mean siteId for GET but entryId for PATCH/DELETE in the same route file.

**Dynamic Forms (Master Dictionary)**
```
GET    /api/forms/categories       → List all categories
GET    /api/forms/categories/[id]  → Get category with subcategories + field definitions
POST   /api/entries/dynamic        → Submit dynamic form entry
```

**Resource Requests**
```
POST   /api/requests/resource      → Create resource request (Supervisor)
GET    /api/requests/resource      → List requests (Admin: all, Supervisor: own)
PATCH  /api/requests/resource/[id] → Approve/decline (Admin only, body: { status: "Approved" | "Declined" })
```

**Field Requests**
```
POST   /api/requests/field         → Propose new field (Supervisor)
GET    /api/requests/field         → List field requests (Admin)
PATCH  /api/requests/field/[id]    → Approve/decline (Admin only)
DELETE /api/requests/field/[id]    → Withdraw request (Supervisor: own)
```

**Admin**
```
GET    /api/admin/analytics        → Global metrics (Admin only, query: ?period=7d|30d|90d)
GET    /api/admin/live-feed        → Long-polling activity stream (Admin only, query: ?lastActivityId=<timestamp>)
```

**Notifications**
```
GET    /api/notifications          → User's notifications (role-aware filtering, paginated)
PATCH  /api/notifications/[id]    → Mark single notification as read (sets readAt = NOW())
PATCH  /api/notifications         → Mark all as read (body: { markAllRead: true })
```
**Note:** Without these PATCH endpoints the notification bell cannot clear its unread count.

**User**
```
GET    /api/users/me               → Current user profile + extended metadata
PATCH  /api/users/me               → Update user profile
```

### 4.2 Response Structure (Standardized)

**Success (200, 201):**
```json
{
  "success": true,
  "data": { /* resource object */ },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-04-24T10:30:00Z"
  }
}
```

**Error (400, 401, 403, 404, 500):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid",
    "details": { "peopleCount": ["Must be greater than 0"] }
  },
  "meta": {
    "requestId": "req_abc123xyz",
    "timestamp": "2026-04-24T10:30:00Z"
  }
}
```

### 4.3 Long Polling for Live Feed (Admin Only)

**Endpoint:** `GET /api/admin/live-feed?lastActivityId=<timestamp>`

**Behavior:**
1. Client sends `lastActivityId` (ISO 8601 timestamp of last known activity)
2. Server holds request open for **25 seconds**, checking DB every 2 seconds for new entries
3. **If new data found before timeout:** Return 200 with array of new entries (limited to 50 most recent)
4. **If timeout reached:** Return 204 No Content (empty array)
5. Client logic:
   - On 200: Parse response, update UI, re-poll immediately
   - On 204: Wait 3 seconds, then re-poll (avoid hammering on quiet feed)

**Implementation:**
```ts
// /app/api/admin/live-feed/route.ts
export const maxDuration = 30; // Vercel supports up to 300s; 30s is well within that

export async function GET(request: NextRequest) {
  // Server holds up to 25s, polling DB every 2s
  // Returns 200 with data if new entries found, 204 if timeout reached
  // Client re-polls immediately on 200, waits 3s on 204
}
```

**Database Query:**
```sql
SELECT 'labour' AS type, id, site_id, created_at FROM labour_entries WHERE created_at > $1
UNION ALL
SELECT 'material' AS type, id, site_id, created_at FROM material_entries WHERE created_at > $1
UNION ALL
SELECT 'machinery' AS type, id, site_id, created_at FROM machinery_entries WHERE created_at > $1
UNION ALL
SELECT 'expense' AS type, id, site_id, created_at FROM expense_entries WHERE created_at > $1
UNION ALL
SELECT 'incident' AS type, id, site_id, created_at FROM incident_reports WHERE created_at > $1
ORDER BY created_at DESC
LIMIT 50
```
**Note:** `UNION ALL` (not `UNION`) — deduplication is unnecessary and adds overhead. `WHERE` must appear inside each `SELECT`, not after the last `UNION`. Table names are snake_case as Drizzle generates in Postgres.

**Cost:** ~50 DB queries per 25s = ~2 queries/second for an active feed. Negligible at Phase 1 scale. Phase 2 caching reduces this further.

### 4.4 Folder Structure for Routes

```
/app/api/
  ├── auth/[...all]/route.ts           # Better Auth catch-all
  ├── /sites
  │   ├── route.ts                     # GET (list), POST (create)
  │   └── [id]
  │       ├── route.ts                 # GET, PATCH, DELETE (soft-delete → sets archivedAt = NOW())
  │       └── entries/route.ts         # GET entries by siteId (type, from, to params)
  ├── /entries
  │   ├── labour/route.ts              # POST
  │   ├── materials/route.ts           # POST
  │   ├── machinery/route.ts           # POST
  │   ├── expenses/route.ts            # POST (also triggers budget alert check)
  │   ├── incidents/route.ts           # POST
  │   ├── dynamic/route.ts             # POST (Master Dictionary)
  │   └── [id]/route.ts                # PATCH, DELETE (entryId; GET moved to /sites/[id]/entries)
  ├── /forms
  │   ├── categories/route.ts          # GET list
  │   └── categories/[id]/route.ts     # GET with subcategories + fields
  ├── /requests
  │   ├── resource/route.ts            # POST, GET
  │   ├── resource/[id]/route.ts       # PATCH (approve/decline)
  │   ├── field/route.ts               # POST, GET
  │   └── field/[id]/route.ts          # PATCH, DELETE
  ├── /admin
  │   ├── analytics/route.ts           # GET ?period=
  │   └── live-feed/route.ts           # GET long-poll, export maxDuration = 30
  ├── /notifications
  │   ├── route.ts                     # GET (role-aware), PATCH (markAllRead)
  │   └── [id]/route.ts                # PATCH (mark single as read)
  └── /users
      └── me/route.ts                  # GET, PATCH
```

---

## 5. Authentication & Authorization

### 5.1 Better Auth Setup

**Configuration (/lib/auth/config.ts):**

Better Auth manages `users` and `sessions` tables automatically. You extend the user object with a `role` field:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db/client";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  appName: "SiteOps",
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.BETTER_AUTH_URL || "http://localhost:3000"],
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "Supervisor",
        input: false,  // Admin sets role server-side only
      },
    },
  },
});
```

**Important:** After adding `additionalFields`, run `npx drizzle-kit generate` to update Drizzle schema with the `role` column on the `user` table.

### 5.2 Authentication Middleware

**Middleware (/middleware.ts at project root):**

Cookie presence check only (no DB calls in Edge Runtime):

```ts
import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_ROUTES } from "@/lib/auth/constants";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Allow public routes
  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  // Let Better Auth routes through (sign-up, sign-in, etc.)
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // For all other routes, check session cookie presence
  const sessionCookie = request.cookies.get("better-auth.session_token");
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/api/:path*"],
};
```

**Constants (/lib/auth/constants.ts):**

```ts
export const PUBLIC_ROUTES = ["/", "/auth/sign-in", "/auth/sign-up"];

export const ROLES = {
  ADMIN: "Admin",
  SUPERVISOR: "Supervisor",
} as const;
```

### 5.3 Authorization Guards (Route Handler Level)

**Guards (/lib/auth/guards.ts):**

Role checks happen inside route handlers, not middleware (middleware can't do DB calls):

```ts
import { auth } from "@/lib/auth/config";
import { NextRequest } from "next/server";

export async function getSessionFromRequest(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session;
}

export async function requireAuth(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return { error: "UNAUTHORIZED", status: 401 };
  }
  return { session };
}

export async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return { error: "UNAUTHORIZED", status: 401 };
  }
  if (session.user.role !== "Admin") {
    return { error: "FORBIDDEN", status: 403 };
  }
  return { session };
}

// With the current two-role model (Admin | Supervisor), this is functionally
// equivalent to requireAuth — any authenticated user passes. Keep it as a named
// semantic boundary: if a third role (e.g. Viewer) is added, only this guard changes.
export async function requireSiteAccess(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return { error: "UNAUTHORIZED", status: 401 };
  }
  // Allows both Supervisor and Admin (site-level access)
  if (
    session.user.role !== "Supervisor" &&
    session.user.role !== "Admin"
  ) {
    return { error: "FORBIDDEN", status: 403 };
  }
  return { session };
}
```

**Ownership Check Utility (/lib/auth/ownership.ts):**

Pure utility — takes a pre-resolved session (already fetched by the guard) to avoid a double `getSession` call per request:

```ts
interface SessionUser {
  id: string;
  role: string;
}

export function checkOwnership(
  sessionUser: SessionUser,
  resourceOwnerId: string | null
): boolean {
  // Admin can edit anything, Supervisor can only edit their own
  return sessionUser.role === "Admin" || sessionUser.id === resourceOwnerId;
}
```

**Two-tier ownership model — which ID to pass:**

| Operation | Check against | Reason |
|---|---|---|
| POST (create entry) | `site.supervisorId` | Only the assigned supervisor may log to their site |
| PATCH / DELETE (edit entry) | `entry.createdBy` | Only the creator (or Admin) may modify their own entry |

```ts
// POST handler — site-level ownership:
const site = await getSiteById(siteId);
if (!checkOwnership(auth.session.user, site.supervisorId)) {
  return errorResponse(ERROR_CODES.FORBIDDEN, "You can only log entries for sites you supervise", 403, undefined, requestId);
}

// PATCH/DELETE handler — entry-level ownership:
const entry = await getEntryById(entryId, type);
if (!checkOwnership(auth.session.user, entry.createdBy)) {
  return errorResponse(ERROR_CODES.FORBIDDEN, "Cannot edit another supervisor's entry", 403, undefined, requestId);
}
```

### 5.4 User Creation (Phase 1)

Admin creates supervisors via admin route (no open signup):

```ts
// Inside an admin-only route (/api/admin/create-user)
// Using Better Auth's admin plugin if available, or signUpEmail() + updateUser()

import { admin } from "better-auth/plugins";

// In your config, add:
plugins: [admin()],

// Then in your route:
const newUser = await auth.api.createUser({
  body: {
    email: "supervisor@site.com",
    password: "temp-password-change-on-first-login",
    name: "John Doe",
    role: "Supervisor",
  },
});
```

---

## 6. Error Handling & Validation

### 6.1 Validation with Zod

**Schema Definitions (/lib/validation/schemas.ts):**

```ts
import { z } from "zod";
import { MAX_BACKDATE_DAYS } from "@/lib/validation/constants";

// Shared
export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email().max(255);

// Reusable date validator — avoids copy-paste and a subtle Date mutation bug
export const entryDateSchema = z.string().date().refine(
  (d) => {
    const entry = new Date(d);
    const now = new Date();
    const floor = new Date(now);
    floor.setDate(floor.getDate() - MAX_BACKDATE_DAYS);
    return entry >= floor && entry <= now;
  },
  { message: `Entry date must be within the last ${MAX_BACKDATE_DAYS} days` }
);

// Labour entry
export const labourEntrySchema = z.object({
  siteId: uuidSchema,
  date: entryDateSchema,
  workType: z.string().min(1).max(50),
  peopleCount: z.number().int().positive().max(10000),
  remarks: z.string().max(500).optional(),
});

// PATCH/DELETE routing: `type` is always a query param (?type=labour), never a body field.
// The handler reads `searchParams.get("type")`, selects the correct table, then validates
// the body with the matching update schema. This is consistent with DELETE's design.
export const updateLabourEntrySchema = labourEntrySchema.partial().omit({ siteId: true });

// Material entry
export const materialEntrySchema = z.object({
  siteId: uuidSchema,
  date: entryDateSchema,
  materialType: z.string().min(1).max(100),
  quantity: z.number().positive().max(1000000),
  unit: z.string().min(1).max(50),
  remarks: z.string().max(500).optional(),
});

export const updateMaterialEntrySchema = materialEntrySchema.partial().omit({ siteId: true });

// Machinery entry
export const machineryEntrySchema = z.object({
  siteId: uuidSchema,
  date: entryDateSchema,
  equipmentType: z.string().min(1).max(100),
  count: z.number().int().positive().max(10000),
  hoursActive: z.number().positive().max(24),
  remarks: z.string().max(500).optional(),
});

export const updateMachineryEntrySchema = machineryEntrySchema.partial().omit({ siteId: true });

// Expense entry
export const expenseEntrySchema = z.object({
  siteId: uuidSchema,
  date: entryDateSchema,
  description: z.string().min(1).max(500),
  amount: z.number().positive().max(1000000),
  category: z.enum(["Labour", "Materials", "Equipment", "Misc"]),
});

export const updateExpenseEntrySchema = expenseEntrySchema.partial().omit({ siteId: true });

// Resource request
export const resourceRequestSchema = z.object({
  siteId: uuidSchema,
  type: z.enum(["Labour", "Materials", "Money", "Machinery"]),
  details: z.string().min(10).max(1000),
  reason: z.string().min(10).max(500),
});

export const updateResourceRequestSchema = z.object({
  status: z.enum(["Approved", "Declined"]), // Pending excluded — cannot un-approve
});
// IMPORTANT: When status = "Approved", the PATCH handler must also set approvedBy = session.user.id
// at the DB layer. The schema only validates the body; the handler sets approvedBy server-side.

// Dynamic entry (Master Dictionary)
// Step 1: Validate shape here. Step 2: in the handler, fetch fieldDefinition and validate
//   value against fieldDefinition.options when fieldType = 'Dropdown'.
export const dynamicEntrySchema = z.object({
  siteId: uuidSchema,
  date: entryDateSchema,
  fieldDefinitionId: uuidSchema,
  value: z.union([z.string(), z.number(), z.boolean()]), // mirrors JSONB storage types
});
```

**Validation Constants (/lib/validation/constants.ts):**

```ts
export const MAX_BACKDATE_DAYS = 7;
export const MAX_AMOUNT = 1000000;
export const MAX_PEOPLE_COUNT = 10000;
export const MAX_QUANTITY = 1000000;
```

### 6.2 Error Codes & Responses

**Error Codes (/lib/errors/codes.ts):**

```ts
export const ERROR_CODES = {
  // 400s
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_REQUEST: "INVALID_REQUEST",
  MISSING_FIELD: "MISSING_FIELD",
  
  // 401/403
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  
  // 404
  NOT_FOUND: "NOT_FOUND",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  
  // 409
  CONFLICT: "CONFLICT",
  DUPLICATE_ENTRY: "DUPLICATE_ENTRY",
  
  // 500
  INTERNAL_ERROR: "INTERNAL_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;
```

**Response Helpers (/lib/errors/response.ts):**

```ts
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function errorResponse(
  code: string,
  message: string,
  status: number = 400,
  details?: unknown,
  requestId?: string
) {
  const id = requestId || generateRequestId();
  
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        ...(details && { details }),
      },
      meta: {
        requestId: id,
        timestamp: new Date().toISOString(),
      },
    },
    { status }
  );
}

export function validationErrorResponse(error: ZodError, requestId?: string) {
  const fieldErrors = error.flatten().fieldErrors;
  return errorResponse(
    "VALIDATION_ERROR",
    "One or more fields are invalid",
    400,
    fieldErrors,
    requestId
  );
}

export function successResponse(data: unknown, status = 200, requestId?: string) {
  const id = requestId || generateRequestId();
  return NextResponse.json(
    {
      success: true,
      data,
      meta: { requestId: id, timestamp: new Date().toISOString() },
    },
    { status }
  );
}
```

**Database Error Handler (/lib/errors/db.ts):**

PostgreSQL error codes (stable across versions):

```ts
import { NextResponse } from "next/server";
import { ERROR_CODES } from "@/lib/errors/codes";

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

// Returns a structured NextResponse for known PG errors, or null for unknown errors.
// Caller is responsible for handling null (re-throw to outer catch → 500).
// Known errors are logged at warn; unknown errors are NOT logged here (outer catch handles that).
export function handleDbError(dbError: unknown, requestId?: string): NextResponse | null {
  const err = dbError as PgError;

  const constraintMessages: Record<string, string> = {
    "labour_entries_site_id_fk": "Site not found",
    "material_entries_site_id_fk": "Site not found",
    "machinery_entries_site_id_fk": "Site not found",
    "expense_entries_site_id_fk": "Site not found",
    "users_email_unique": "Email already in use",
    // Add more as you discover constraint names
  };

  switch (err.code) {
    case "23503": // foreign_key_violation
      logWarn(requestId ?? "unknown", "FK violation", { constraint: err.constraint });
      return errorResponse(
        ERROR_CODES.CONFLICT,
        constraintMessages[err.constraint ?? ""] || "Referenced record not found",
        409,
        undefined,
        requestId
      );
    case "23505": // unique_violation
      logWarn(requestId ?? "unknown", "Unique violation", { constraint: err.constraint });
      return errorResponse(
        ERROR_CODES.CONFLICT,
        constraintMessages[err.constraint ?? ""] || "Duplicate entry",
        409,
        undefined,
        requestId
      );
    case "23502": // not_null_violation
      logWarn(requestId ?? "unknown", "Not-null violation", { constraint: err.constraint });
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        "Required field missing",
        400,
        undefined,
        requestId
      );
    case "23514": // check_violation
      logWarn(requestId ?? "unknown", "Check violation", { constraint: err.constraint });
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        "Value out of allowed range",
        400,
        undefined,
        requestId
      );
    default:
      return null; // Unknown — let caller re-throw to outer catch which logs + returns 500
  }
}
```

**Correct usage in route handlers:**
```ts
// Inner DB try/catch:
try {
  const entry = await insertLabourEntry({ ... });
  return successResponse(entry, 201, requestId);
} catch (dbError) {
  const handled = handleDbError(dbError, requestId);
  if (handled) return handled;   // Known PG error → structured 4xx response
  throw dbError;                  // Unknown → bubble to outer catch → logged + 500
}
```
```

### 6.3 Logging

**Logger (/lib/logging/log.ts):**

Structured JSON logging for Vercel log parsing (Phase 2: Datadog/Sentry):

```ts
export function logError(requestId: string, error: unknown, context?: unknown) {
  console.error(JSON.stringify({
    level: "error",
    requestId,
    timestamp: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
  }));
}

export function logInfo(requestId: string, message: string, data?: unknown) {
  console.log(JSON.stringify({
    level: "info",
    requestId,
    timestamp: new Date().toISOString(),
    message,
    data,
  }));
}

// Used by handleDbError for known PG constraint violations (FK, unique, etc.)
export function logWarn(requestId: string, message: string, data?: unknown) {
  console.warn(JSON.stringify({
    level: "warn",
    requestId,
    timestamp: new Date().toISOString(),
    message,
    data,
  }));
}
```

### 6.4 Rate Limiting

**Phase 1 Stub (/lib/middleware/rateLimit.ts):**

In-memory rate limiting doesn't work on serverless (each invocation is isolated). Phase 1 uses a honest stub:

```ts
// Rate limiting via in-memory Map is non-functional on Vercel serverless.
// Each invocation is an isolated process; Map state doesn't persist.
// 
// Phase 1 protection:
//   - Auth endpoints: Better Auth's built-in brute-force guard
//   - Data routes: Auth guard (unauthenticated users can't spam)
//
// Phase 2: Add Upstash Redis-based rate limiting

export function checkRateLimit(_key: string): boolean {
  return true; // Passthrough until Phase 2
}
```

**Phase 2:** Upstash Redis HTTP client for actual rate limiting (no persistent connections needed for serverless).

---

## 7. Folder Structure & Code Organization

### 7.1 Complete Directory Layout

```
siteops/
├── .env.local                      # Local secrets (git-ignored)
├── .env.example                    # Template (with comments)
├── .gitignore
├── middleware.ts                   # Auth cookie checks
├── next.config.ts
├── tsconfig.json                   # Strict mode
├── drizzle.config.ts              # Drizzle migration config
├── package.json
│
├── /app
│   ├── layout.tsx                  # Root layout — wraps children with PostHogProvider
│   ├── page.tsx                    # Landing page (/)
│   │
│   ├── /auth
│   │   ├── layout.tsx
│   │   ├── sign-in/page.tsx
│   │   └── sign-up/page.tsx
│   │
│   ├── /app                        # Protected app routes
│   │   ├── layout.tsx              # App shell (header, sidebar, footer)
│   │   ├── /dashboard
│   │   │   └── page.tsx            # HOME view
│   │   ├── /sites
│   │   │   └── [id]/page.tsx       # WORKSITE_DASHBOARD view
│   │   ├── /entries
│   │   │   ├── labour/page.tsx
│   │   │   ├── materials/page.tsx
│   │   │   ├── machinery/page.tsx
│   │   │   ├── expenses/page.tsx
│   │   │   └── incidents/page.tsx
│   │   ├── /history
│   │   │   └── page.tsx            # HISTORY view
│   │   ├── /notifications
│   │   │   └── page.tsx            # NOTIFICATIONS view
│   │   ├── /profile
│   │   │   └── page.tsx            # PROFILE view
│   │   └── /admin
│   │       ├── /analytics
│   │       │   └── page.tsx        # ADMIN_ANALYTICS view
│   │       ├── /approvals
│   │       │   └── page.tsx        # ADMIN_APPROVALS view
│   │       └── /live-feed
│   │           └── page.tsx        # ADMIN_LIVE_FEED view
│   │
│   └── /api
│       ├── auth/[...all]/route.ts           # Better Auth catch-all
│       ├── /sites
│       │   ├── route.ts                     # GET (list), POST (create)
│       │   └── [id]/
│       │       ├── route.ts                 # GET, PATCH, DELETE (soft-delete)
│       │       └── entries/route.ts         # GET entries for this site (type, from, to params)
│       ├── /entries
│       │   ├── labour/route.ts              # POST
│       │   ├── materials/route.ts           # POST (+ budget alert check)
│       │   ├── machinery/route.ts           # POST
│       │   ├── expenses/route.ts            # POST (+ budget alert check)
│       │   ├── incidents/route.ts           # POST (+ incident notification)
│       │   ├── dynamic/route.ts             # POST (Master Dictionary)
│       │   └── [id]/route.ts                # PATCH, DELETE only (GET is on /sites/[id]/entries)
│       ├── /forms
│       │   ├── categories/route.ts          # GET list
│       │   └── categories/[id]/route.ts     # GET with subcategories + fields
│       ├── /requests
│       │   ├── resource/route.ts            # POST, GET
│       │   ├── resource/[id]/route.ts       # PATCH (approve/decline; sets approvedBy server-side)
│       │   ├── field/route.ts               # POST, GET
│       │   └── field/[id]/route.ts          # PATCH, DELETE
│       ├── /admin
│       │   ├── analytics/route.ts           # GET
│       │   └── live-feed/route.ts           # GET (long-poll, maxDuration = 30)
│       ├── /notifications
│       │   ├── route.ts                     # GET (paginated), PATCH (markAllRead)
│       │   └── [id]/route.ts                # PATCH (mark single as read)
│       └── /users
│           └── me/route.ts                  # GET, PATCH
│
├── /lib
│   ├── /db
│   │   ├── client.ts               # Neon HTTP adapter + Drizzle
│   │   ├── client.ws.ts            # Neon WebSocket (migrations only)
│   │   ├── schema.ts               # Table definitions + enums
│   │   ├── /queries
│   │   │   ├── sites.ts            # getSiteById(), getSitesBySupervisor(), getSiteTotalExpenses(), etc.
│   │   │   ├── entries.ts          # getEntriesBySite(), insertLabourEntry(), etc.
│   │   │   ├── liveFeed.ts         # getActivitySince(since, limit)
│   │   │   └── notifications.ts    # getNotificationsForUser(), createNotification(), getAllAdmins()
│   │   └── /migrations             # Auto-generated
│   │
│   ├── /auth
│   │   ├── config.ts               # Better Auth init + role field
│   │   ├── guards.ts               # requireAuth(), requireAdmin(), requireSiteAccess()
│   │   ├── ownership.ts            # checkOwnership() utility
│   │   └── constants.ts            # PUBLIC_ROUTES, ROLES
│   │
│   ├── /errors
│   │   ├── codes.ts                # Error code constants
│   │   ├── response.ts             # errorResponse(), validationErrorResponse()
│   │   └── db.ts                   # handleDbError()
│   │
│   ├── /validation
│   │   ├── schemas.ts              # All Zod schemas
│   │   └── constants.ts            # MAX_BACKDATE_DAYS, limits
│   │
│   ├── /middleware
│   │   └── rateLimit.ts            # Phase 1 stub, Phase 2 Redis
│   │
│   ├── /logging
│   │   └── log.ts                  # logError(), logInfo(), logWarn()
│   │
│   ├── /utils
│   │   ├── requestId.ts            # generateRequestId()
│   │   └── formatters.ts           # Date/currency formatting
│   │
│   ├── /types
│   │   └── index.ts                # Shared TypeScript types
│   │
│   └── /analytics
│       └── posthog.ts              # PostHog client init + capture() helpers
│
├── /components
│   ├── /layout
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Footer.tsx
│   │   └── AppShell.tsx
│   ├── /forms
│   │   ├── LabourEntryForm.tsx
│   │   ├── MaterialEntryForm.tsx
│   │   └── DynamicFormRenderer.tsx
│   ├── /dashboard
│   │   ├── SiteCard.tsx
│   │   └── SiteStatsPanel.tsx
│   └── /common
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Modal.tsx
│       └── LoadingSpinner.tsx
│
├── /hooks
│   ├── useSites.ts
│   ├── useEntries.ts
│   ├── useAuth.ts
│   └── useOfflineQueue.ts          # IndexedDB-backed queue; flushes pending submissions on reconnect
│
├── /.docs
│   └── (existing architecture files, updated per design)
│
└── /public
    ├── manifest.json               # PWA: name, icons, display: standalone, theme_color
    └── (static assets + icons)
```

### 7.2 Utility Implementations

**`/lib/utils/requestId.ts`:**
```ts
import { randomUUID } from "crypto";

export function generateRequestId(): string {
  return `req_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
```

### 7.3 Import Conventions

**✅ Good:**
```ts
import { requireAdmin } from "@/lib/auth/guards";
import { ERROR_CODES } from "@/lib/errors/codes";
import { db } from "@/lib/db/client";
import { NextRequest } from "next/server";
```

**❌ Avoid (barrel imports, can create circular dependencies):**
```ts
import { requireAdmin } from "@/lib/auth"; // Don't use index files
```

### 7.4 Dependency Flow (Acyclic)

```
Route Handlers (/app/api/*/route.ts)
  ↓ calls
Guards (/lib/auth/guards.ts) + Validation (/lib/validation/schemas.ts)
  ↓ calls
DB Queries (/lib/db/queries/*.ts)
  ↓ calls
DB Client (/lib/db/client.ts) + Error Handlers (/lib/errors/*.ts)
  ↓ calls
Drizzle Schema (/lib/db/schema.ts)

React Pages (/app/app/*/page.tsx)
  ↓ use
Hooks (/hooks/*.ts)
  ↓ call
fetch() → Route Handlers
```

### 7.5 File Naming

| Type | Pattern | Example |
|---|---|---|
| Route handler | `route.ts` | `/app/api/sites/route.ts` |
| React page | `page.tsx` | `/app/app/dashboard/page.tsx` |
| React component | `PascalCase.tsx` | `LabourEntryForm.tsx` |
| Custom hook | `useCamelCase.ts` | `useSites.ts` |
| Utility/helper | `camelCase.ts` | `requestId.ts` |
| Config/constants | `camelCase.ts` | `config.ts`, `constants.ts` |
| Zod schema | `schemas.ts` | (centralized) |

---

## 8. Environment Variables

**`.env.example` (commit to repo):**

```bash
# Better Auth
BETTER_AUTH_URL=http://localhost:3000
# Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=your-secret-key-here

# Neon PostgreSQL
DATABASE_URL=postgresql://user:password@ep-xyz.neon.tech/siteops?sslmode=require

# Next.js (client-visible)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Phase 2: Upstash Redis (add when caching needed)
# UPSTASH_REDIS_REST_URL=https://...
# UPSTASH_REDIS_REST_TOKEN=...
```

**`.env.local` (git-ignored, local development only):**

Copy `.env.example` and fill in real values.

---

## 9. Implementation Phases

### Phase 1: Database + Auth + Core APIs (Now)

**Deliverables:**
- ✅ Neon database with schema (Drizzle)
- ✅ Better Auth configured with role field
- ✅ All API routes (GET/POST/PATCH/DELETE) including soft-delete for sites
- ✅ Input validation (Zod)
- ✅ Error handling + logging
- ✅ Notification triggers at route handler level (`createNotification()` after relevant actions)
- ✅ Long polling for admin live feed
- ✅ Route handlers tested with Postman/curl
- ✅ React UI components connected to APIs
- ✅ PostHog: install `@posthog/next`, wrap root layout with `PostHogProvider`, capture `entry_submitted` / `request_raised` / `incident_reported`, enable exception autocapture + session replay
- ✅ PWA: `@serwist/next` (`withSerwist` HOC in `next.config.ts`, service worker at `app/sw.ts`) + `/public/manifest.json`, offline cache for entry forms, `useOfflineQueue` hook (IndexedDB) for pending submissions

**Success Metrics:**
- All 15+ API endpoints respond correctly
- Validation errors return 400 with field errors
- Unauthenticated requests return 401
- DB constraints enforced (FK violations → 409)
- Live feed polls without timing out

### Phase 2: Caching + Performance (When Needed)

**Deliverables:**
- ✅ Upstash Redis setup (Mumbai region)
- ✅ Cache layer for analytics queries, feed snapshots
- ✅ Real rate limiting via Upstash
- ✅ Cache invalidation strategies
- ✅ Monitoring + cache hit rates

### Phase 3: Real-time + Advanced (Optional)

**Deliverables:**
- ✅ Migrate from polling to Server-Sent Events (SSE)
- ✅ Notifications push (if needed)
- ✅ WebSocket for truly real-time features (if moving off Vercel)

---

## 10. Testing Strategy

### Phase 1 Testing (Manual + Integration)

- **Postman/curl:** Test all CRUD endpoints with various inputs
- **Zod validation:** Test invalid inputs (negative counts, future dates, etc.)
- **Auth guards:** Test unauthenticated, wrong role, ownership checks
- **DB constraints:** Test FK violations, unique violations
- **Long polling:** Test 25s hold time, timeout behavior, payload size

### Phase 2 Testing (Automated)

- Unit tests for query functions (/lib/db/queries/*.ts)
- Integration tests for route handlers (mocked auth)
- E2E tests via Next.js test framework (Playwright/Cypress)

---

## 11. Monitoring & Logs

### Phase 1

Structured JSON logs to stdout. Vercel captures and parses:
- Error logs (with stack traces, requestId)
- Info logs (route entry, query counts)
- Search by `requestId` to trace a user's request end-to-end

### Phase 2

Integrate Datadog/Sentry for:
- Exception tracking
- Performance metrics (query latencies, long-poll response times)
- Budget alerts (Admins watching spend)

---

## 12. Security Checklist

- ✅ No SQL injection (Drizzle parameterized queries)
- ✅ No XSS (JSON responses, no HTML generation)
- ✅ CSRF protection (SameSite cookies via Better Auth)
- ✅ Rate limiting (Phase 1: auth only, Phase 2: full)
- ✅ Authorization checks (guards on all protected routes)
- ✅ Input validation (Zod schemas)
- ✅ Sensitive data not in logs (no passwords, emails in full)
- ✅ HTTPS enforced (Vercel native)
- ✅ Database secrets in env vars (never in code)
- ✅ HttpOnly session cookies (Better Auth managed)

---

## 13. Known Limitations & Trade-offs

| Limitation | Reason | Mitigation |
|---|---|---|
| In-memory rate limiting (Phase 1) | Serverless isolation prevents shared state | Switch to Upstash Redis in Phase 2 |
| Long polling (25s hold) | Server holds 25s; client sets its own fetch timeout (~30s) and re-polls on 204 | Consider SSE in Phase 3 if moving off Vercel |
| Computed aggregates (no `total_spend` column) | Avoids stale data, simpler migrations | Query-time aggregates acceptable at small scale |
| Single Neon region (Singapore) | Better latency for Asia, cold starts | Add read replicas in Phase 3 for multi-region |
| Offline support limited to entry forms | PWA (`@serwist/next`) + `useOfflineQueue` (IndexedDB) queues submissions; flushes on reconnect | Non-form views (dashboard, analytics) still require connectivity |

---

## 14. Future Enhancements (Post-Phase 3)

- Multi-region read replicas for global scale
- Custom analytics dashboards (Metabase/Tableau integration)
- Mobile app (React Native, reuse hooks)
- Webhooks for third-party integrations
- Audit trail versioning (all entity changes logged)
- Budget forecasting (ML on spending patterns)

---

## Appendix A: File Templates

### Example Route Handler (`/app/api/entries/labour/route.ts`)

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireSiteAccess } from "@/lib/auth/guards";
import { checkOwnership } from "@/lib/auth/ownership";
import { db } from "@/lib/db/client";
import { labourEntries, sites } from "@/lib/db/schema";
import { insertLabourEntry } from "@/lib/db/queries/entries";
import { labourEntrySchema } from "@/lib/validation/schemas";
import { 
  errorResponse, 
  validationErrorResponse,
  successResponse,
} from "@/lib/errors/response";
import { handleDbError } from "@/lib/errors/db";
import { ERROR_CODES } from "@/lib/errors/codes";
import { generateRequestId } from "@/lib/utils/requestId";

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    // 1. Auth
    const auth = await requireSiteAccess(request);
    if ("error" in auth) {
      return errorResponse(auth.error, "Authentication required", auth.status, undefined, requestId);
    }

    // 2. Parse JSON
    let body;
    try {
      body = await request.json();
    } catch {
      return errorResponse(ERROR_CODES.INVALID_REQUEST, "Invalid JSON", 400, undefined, requestId);
    }

    // 3. Validate
    const validation = labourEntrySchema.safeParse(body);
    if (!validation.success) {
      return validationErrorResponse(validation.error, requestId);
    }

    const { siteId, date, workType, peopleCount, remarks } = validation.data;

    // 4. Check site exists + ownership
    const site = await db.query.sites.findFirst({
      where: (sites, { eq }) => eq(sites.id, siteId),
      columns: { supervisorId: true },
    });

    if (!site) {
      return errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId);
    }

    if (!checkOwnership(auth.session.user, site.supervisorId)) {
      return errorResponse(ERROR_CODES.FORBIDDEN, "You can only log entries for sites you supervise", 403, undefined, requestId);
    }

    // 5. Insert
    try {
      const entry = await insertLabourEntry({
        siteId,
        date: new Date(date),
        workType,
        peopleCount,
        remarks: remarks || null,
        createdBy: auth.session.user.id,
      });

      return successResponse(entry, 201, requestId);
    } catch (dbError) {
      // handleDbError returns NextResponse for known PG errors, null for unknown
      const handled = handleDbError(dbError, requestId);
      if (handled) return handled;
      throw dbError; // unknown → bubble to outer catch → logged + 500
    }
  } catch (error) {
    logError(requestId, error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred", 500, undefined, requestId);
  }
}
```

### Example Query Function (`/lib/db/queries/entries.ts`)

```ts
import { db } from "@/lib/db/client";
import { labourEntries } from "@/lib/db/schema";

export async function insertLabourEntry(data: {
  siteId: string;
  date: Date;
  workType: string;
  peopleCount: number;
  remarks: string | null;
  createdBy: string;
}) {
  const result = await db.insert(labourEntries).values(data).returning();
  return result[0];
}

export async function getEntriesBySite(siteId: string, type: "labour" | "material" | "machinery" | "expense", filters?: {
  from?: string;
  to?: string;
}) {
  // Fetch based on type and date range
  // Return paginated results
}
```

### Soft-delete Pattern for Sites (`DELETE /api/sites/[id]`)

```ts
// /app/api/sites/[id]/route.ts — DELETE handler
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const requestId = generateRequestId();
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) {
      return errorResponse(auth.error, "Admin access required", auth.status, undefined, requestId);
    }

    const site = await getSiteById(params.id);
    if (!site) {
      return errorResponse(ERROR_CODES.NOT_FOUND, "Site not found", 404, undefined, requestId);
    }
    if (site.archivedAt) {
      return errorResponse(ERROR_CODES.CONFLICT, "Site already archived", 409, undefined, requestId);
    }

    await db.update(sites)
      .set({ archivedAt: new Date() })
      .where(eq(sites.id, params.id));

    return successResponse(null, 200, requestId);
  } catch (error) {
    logError(requestId, error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, "An unexpected error occurred", 500, undefined, requestId);
  }
}
```

---

## Appendix B: Drizzle Schema Snippet

```ts
// /lib/db/schema.ts (partial)
import { pgTable, uuid, varchar, text, timestamp, date, integer, boolean, jsonb, decimal, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const siteStatusEnum = pgEnum('site_status', ['In Progress', 'Blocked', 'Completed']);
export const requestStatusEnum = pgEnum('request_status', ['Pending', 'Approved', 'Declined']);
// ... other enums

// Tables
export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  location: varchar("location", { length: 255 }).notNull(),
  status: siteStatusEnum("status").notNull().default("In Progress"),
  budget: decimal("budget", { precision: 15, scale: 2 }).notNull(),
  currentProgress: integer("current_progress").default(0),
  currentPhase: varchar("current_phase", { length: 100 }),
  supervisorId: uuid("supervisor_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ... more tables
```

---

## Document Metadata

- **Author:** SiteOps Backend Design
- **Status:** Final (awaiting review)
- **Last Updated:** 2026-04-24
- **Next Steps:** Implementation planning phase (invoke writing-plans skill)
