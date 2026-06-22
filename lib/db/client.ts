import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local");
}

// `prepare: false` is required when using Supabase's Transaction pooler (port 6543).
// Prepared statements are session-scoped and incompatible with connection poolers
// that route each query to a potentially different backend connection.
function createClient() {
  return postgres(process.env.DATABASE_URL!, {
    max: 15, // headroom for endpoints that fan out many queries at once; well
    // under Supabase's pooler limit. A too-small pool starves under parallel load.
    idle_timeout: 120, // hold connections 2m idle so low-traffic/dev bursts skip the cold TLS+pooler handshake, without pinning pooler slots too long
    connect_timeout: 10,
    ssl: process.env.NODE_ENV === "production" ? "require" : false,
    prepare: false, // mandatory for Supabase Transaction pooler
    connection: {
      application_name: "siteops-next",
      // NOTE: a client-side statement_timeout is STRIPPED by the Supavisor pooler
      // (proven: SHOW statement_timeout stays at the pooler default through :6543),
      // so it is set server-side on the `postgres` role instead — see
      // scripts/apply-statement-timeout.mts. That role-level timeout is what reaps
      // orphaned queries from aborted requests and keeps the pool healthy.
    },
  });
}

// Reuse the client across HMR reloads in dev and across warm Vercel invocations,
// preventing connection storms on the Supabase pooler.
const globalForDb = globalThis as unknown as {
  __siteopsDb?: ReturnType<typeof drizzle<typeof schema>>;
};

export const db = globalForDb.__siteopsDb ?? drizzle(createClient(), { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__siteopsDb = db;
}
