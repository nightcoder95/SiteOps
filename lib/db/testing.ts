// Integration-test helper. Runs the callback inside a transaction that is ALWAYS
// rolled back, so seeded rows never persist. Tests using this auto-skip when no
// DATABASE_URL is configured (keeps the unit suite green in DB-less CI).
import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describe } from "vitest";

import * as schema from "@/lib/db/schema";
import { sites, userProfiles } from "@/lib/db/schema";

export const hasDb =
  Boolean(process.env.DATABASE_URL) &&
  !process.env.DATABASE_URL.includes("your-project-ref") &&
  !process.env.DATABASE_URL.includes("aws-0-region");

// Describe-or-skip: use in place of `describe` for DB integration suites.
export const describeDb = hasDb ? describe : describe.skip;

type Db = ReturnType<typeof drizzle<typeof schema>>;
// The drizzle handle passed inside a transaction (PgTransaction). Query-builder
// surface (.insert/.select/.execute) matches the top-level db, so tests are agnostic.
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Runs `fn` with a transactional drizzle handle, then throws a sentinel to force
// rollback. Each test gets a clean slate without truncating shared tables.
export async function withRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  const database = drizzle(client, { schema });
  const ROLLBACK = Symbol("rollback");
  let captured: T;
  try {
    await database.transaction(async (tx) => {
      captured = await fn(tx);
      throw ROLLBACK; // abort the tx; nothing persists
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await client.end({ timeout: 5 });
  }
  return captured!;
}

// Seeds a user profile + a site inside the given transaction and returns their
// ids. Entry tables FK to sites.siteId, which FKs to userProfiles.userId, so most
// data tests need this minimal chain.
export async function seedSite(tx: Tx): Promise<{ userId: string; siteId: string }> {
  const userId = randomUUID();
  await tx.insert(userProfiles).values({ userId, role: "Supervisor" });
  const [site] = await tx
    .insert(sites)
    .values({
      name: `Test Site ${userId.slice(0, 8)}`,
      location: "Test",
      supervisorId: userId,
      createdByUserId: userId,
      updatedByUserId: userId,
    })
    .returning({ siteId: sites.siteId });
  return { userId, siteId: site.siteId };
}
