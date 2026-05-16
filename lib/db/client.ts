import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local");
}

// `prepare: false` is required when using Supabase's Transaction pooler (port 6543).
// Prepared statements are session-scoped and incompatible with connection poolers
// that route each query to a potentially different backend connection.
function createDb() {
  const client = postgres(process.env.DATABASE_URL!, {
    max: 5, // stay well under Supabase's pooler connection limit
    idle_timeout: 60, // amortize TLS handshake on warm Vercel invocations
    connect_timeout: 10,
    ssl: process.env.NODE_ENV === "production" ? "require" : false,
    prepare: false, // mandatory for Supabase Transaction pooler
    connection: {
      application_name: "siteops-next",
    },
  });
  return drizzle(client, { schema });
}

// Reuse the client across HMR reloads in dev and across warm Vercel invocations,
// preventing connection storms on the Supabase pooler.
const globalForDb = globalThis as unknown as {
  __siteopsDb?: ReturnType<typeof createDb>;
};

export const db = globalForDb.__siteopsDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__siteopsDb = db;
}
