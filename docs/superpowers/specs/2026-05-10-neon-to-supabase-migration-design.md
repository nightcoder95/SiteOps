# Neon → Supabase Migration Design

**Date:** 2026-05-10  
**Approach:** Big Bang — single branch, full replacement  
**Data migration:** None (clean slate, test data only)

---

## 1. Scope Summary

| Layer | Before | After |
|---|---|---|
| Database host | Neon PostgreSQL | Supabase PostgreSQL |
| DB driver | `@neondatabase/serverless` | `postgres` (postgres-js) |
| Drizzle adapter | `drizzle-orm/neon-serverless` | `drizzle-orm/postgres-js` |
| Auth provider | Better Auth | Supabase Auth (`@supabase/ssr`) |
| Role storage | `betterAuthUsers.role` | `user_profiles.role` + Redis cache |
| Auth tables | 4 Better Auth tables in schema | Removed (Supabase owns `auth.users`) |

**Unchanged:** Drizzle schema (business tables), Redis cache layer, all API route interfaces, `lib/auth/guards.ts` public API, `lib/auth/ownership.ts`, `lib/auth/constants.ts`.

---

## 2. Dependencies

### Remove
```
better-auth
@neondatabase/serverless
ws
@types/ws
```

### Add
```
@supabase/ssr
@supabase/supabase-js
postgres
```

---

## 3. Environment Variables

### Remove
```
BETTER_AUTH_URL
BETTER_AUTH_SECRET
```

### Add / Replace
```bash
NEXT_PUBLIC_SUPABASE_URL=https://[ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Transaction Pooler — used by app at runtime (serverless-safe)
DATABASE_URL=postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres

# Direct connection — used by drizzle-kit for migrations only
DIRECT_URL=postgresql://postgres:[pass]@db.[ref].supabase.co:5432/postgres
```

---

## 4. DB Client

### Files changed
- `lib/db/client.ts` — rewritten
- `lib/db/client.ws.ts` — **deleted** (WebSocket shim was Neon-specific)

### New `lib/db/client.ts`
```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
```

All `dbWs` imports across the codebase → `db`.

### `drizzle.config.ts`
Switch `dbCredentials.url` to `DIRECT_URL` (direct connection required for schema migrations):
```ts
dbCredentials: {
  url: process.env.DIRECT_URL!,
}
```

---

## 5. Schema Changes

### Remove from `lib/db/schema.ts`
- `betterAuthUsers` (`users` table)
- `betterAuthSessions` (`sessions` table)
- `betterAuthAccounts` (`accounts` table)
- `betterAuthVerifications` (`verifications` table)

Supabase Auth manages user identity in its internal `auth.users` table — not in our schema.

### `user_profiles` — add `role` column
`userId uuid` maps directly to Supabase Auth's user UUID. Add role as the source of truth:
```ts
role: userRoleEnum("role").notNull().default("Supervisor"),
```
`userRoleEnum` already exists in schema — no new enum needed.

### New migration
`lib/db/migrations/0005_remove_better_auth_tables.sql` — drops the 4 Better Auth tables and adds `role` column to `user_profiles`.

### Update `lib/db/queries/notifications.ts`
`getAllAdmins()` currently reads `betterAuthUsers.role`. Switch to `userProfiles`:
```ts
export async function getAllAdmins() {
  return db
    .select({ id: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.role, "Admin"));
}
```

---

## 6. Auth Layer

### `lib/auth/config.ts` — rewritten
Exports two Supabase client factories (not singletons — cookies differ per request):

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (c) =>
          c.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );
}

// Service role client — bypasses RLS, used server-side only
export function createSupabaseServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}
```

### `lib/auth/session.ts` — rewritten
Fetches Supabase user + role from Redis cache (DB fallback):

```ts
import { eq } from "drizzle-orm";
import { createSupabaseServerClient } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";
import { getOrSetJson } from "@/lib/cache/getOrSetJson";

export async function getSessionUser() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await getOrSetJson(`userProfile:${user.id}`, () =>
    db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, user.id),
    })
  );

  return {
    id: user.id,
    email: user.email!,
    role: profile?.role ?? "Supervisor",
  };
}
```

### `lib/auth/guards.ts` — interface unchanged
`requireAuth`, `requireAdmin`, `requireSiteAccess` keep identical signatures. Internally replace `safeGetSessionFromHeaders(request.headers)` → `getSessionUser()`. **All 15+ API route call sites: zero changes.**

### Deleted
- `app/api/auth/[...all]/route.ts` — Better Auth handler, not needed

---

## 7. Middleware

Supabase SSR requires the response object to be threaded through so refreshed session cookies are written back to the browser.

### New `middleware.ts`
```ts
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_ROUTES } from "@/lib/auth/constants";
import { ERROR_CODES } from "@/lib/errors/codes";
import { upstashRateLimit } from "@/lib/rateLimit/upstash";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (c) =>
          c.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          ),
      },
    }
  );

  // Must call getUser() (not getSession()) — validates token server-side
  const { data: { user } } = await supabase.auth.getUser();

  if (PUBLIC_ROUTES.includes(pathname)) return response;

  if (pathname.startsWith("/api") && upstashRateLimit) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const result = await upstashRateLimit.limit(`${ip}:${pathname}`);
    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.RATE_LIMITED,
            message: "Too many requests",
            details: { limit: result.limit, remaining: result.remaining, reset: result.reset },
          },
          meta: { requestId: null, timestamp: new Date().toISOString() },
        },
        { status: 429 }
      );
    }
  }

  if (!user) {
    return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

**Note:** Use `supabase.auth.getUser()` not `getSession()` in middleware — `getUser()` validates the JWT server-side against Supabase, preventing forged cookies.

---

## 8. Sign-in / Sign-up Pages

Both pages currently call Better Auth REST endpoints via raw `fetch`. Replace with Supabase client calls.

### `app/auth/sign-in/page.tsx`
Replace `fetch('/api/auth/sign-in/email', ...)` with:
```ts
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const { error } = await supabase.auth.signInWithPassword({ email, password });
if (error) { setError(error.message); return; }
router.replace("/app/dashboard");
```

### `app/auth/sign-up/page.tsx`
Replace `fetch('/api/auth/sign-up/email', ...)` with:
```ts
// Pass name into user_metadata — Supabase Auth stores it, not user_profiles
const { error } = await supabase.auth.signUp({
  email,
  password,
  options: { data: { name } },
});
if (error) { setError(error.message); return; }

// Trigger server-side user_profiles row creation (session cookie is now set)
await fetch("/api/auth/create-profile", { method: "POST" });

router.replace("/app/dashboard");
```

### New `app/api/auth/create-profile/route.ts`
Reads userId from the verified session cookie — never trusts client-supplied userId.
`user_profiles` has no `name` column; name lives in Supabase Auth `user_metadata`.
```ts
export async function POST() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db.insert(userProfiles).values({ userId: user.id });

  return NextResponse.json({ success: true });
}
```

---

## 9. Migration Execution Order

1. Install/uninstall deps
2. Create Supabase project, copy env vars
3. Update `drizzle.config.ts` to use `DIRECT_URL`
4. Remove Better Auth tables from `lib/db/schema.ts`
5. Generate migration: `drizzle-kit generate`
6. Push schema to Supabase: `drizzle-kit migrate`
7. Rewrite `lib/db/client.ts`, delete `lib/db/client.ws.ts`
8. Rewrite `lib/auth/config.ts`, `lib/auth/session.ts`, `lib/auth/guards.ts`
9. Rewrite `middleware.ts`
10. Delete `app/api/auth/[...all]/route.ts`
11. Add `app/api/auth/create-profile/route.ts`
12. Update sign-in/sign-up pages
13. Update `.env.example`
14. Run type-check + tests
