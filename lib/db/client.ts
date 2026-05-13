import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local");
}

// `prepare: false` is required when using Supabase's Transaction pooler (port 6543).
// Prepared statements are session-scoped and incompatible with connection poolers
// that route each query to a potentially different backend connection.
const client = postgres(process.env.DATABASE_URL, {
  max: 5,           // stay well under Supabase's pooler connection limit
  idle_timeout: 20, // close idle connections after 20 s to free pooler slots
  connect_timeout: 10,
  ssl: process.env.NODE_ENV === "production" ? "require" : false,
  prepare: false,   // mandatory for Supabase Transaction pooler
});

export const db = drizzle(client, { schema });
