// scripts/measure-db-latency.mts
// Measures DB round-trip latency to locate the "not instant" cost: connection
// handshake vs per-query RTT vs query compute. Compares pooler (:6543) and direct
// (:5432). Run: node --import tsx scripts/measure-db-latency.mts
//
// Env is loaded from .env.local first (where DIRECT_URL lives in this repo) then
// .env, matching how Next resolves precedence — without this DIRECT_URL is unset
// and the direct target silently skips.
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

const TARGETS = [
  ["pooler (DATABASE_URL)", process.env.DATABASE_URL],
  ["direct (DIRECT_URL)", process.env.DIRECT_URL],
] as const;

const N = 50;

function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

async function probe(label: string, url: string): Promise<void> {
  // URL() can't parse the postgres:// scheme uniformly across platforms; swap to
  // http:// purely to extract the host for region identification.
  const host = new URL(url.replace(/^postgres(ql)?:\/\//, "http://")).host;
  const sql = postgres(url, { max: 1, prepare: false, ssl: "require" });
  try {
    const t0 = Date.now();
    await sql`select 1`; // includes cold connect
    const coldMs = Date.now() - t0;

    const rtts: number[] = [];
    for (let i = 0; i < N; i++) {
      const s = Date.now();
      await sql`select 1`;
      rtts.push(Date.now() - s);
    }

    const q0 = Date.now();
    await sql`select * from sites where is_deleted = false order by updated_at desc limit 200`;
    const queryMs = Date.now() - q0;

    console.log(`\n== ${label} == host=${host}`);
    console.log(`cold connect+query: ${coldMs}ms`);
    console.log(
      `SELECT 1 rtt p50=${pct(rtts, 50)}ms p95=${pct(rtts, 95)}ms max=${Math.max(...rtts)}ms`,
    );
    console.log(`sites query: ${queryMs}ms`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

for (const [label, url] of TARGETS) {
  if (!url) {
    console.log(`skip ${label}: env not set`);
    continue;
  }
  await probe(label, url).catch((e) => console.error(`${label} failed:`, e.message));
}
