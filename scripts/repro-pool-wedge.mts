// Reproduces the pool-exhaustion freeze and proves the fix. Fires N concurrent
// catalog requests each aborted after `abortMs`, then sends one final clean
// request and times it. Before the fix the final request hangs (the pool is
// wedged with orphaned queries); after, it returns in well under a second.
//
// Usage:
//   BASE=http://127.0.0.1:3000 TOKEN=<bearer> node --import tsx scripts/repro-pool-wedge.mts
// Get a bearer token via the Supabase password grant (see the handoff doc).
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const TOKEN = process.env.TOKEN;
const PATH = "/api/admin/catalog";
const N = Number(process.env.N ?? 15);
const ABORT_MS = Number(process.env.ABORT_MS ?? 1000);

const headers: Record<string, string> = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};

async function abortedHit() {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ABORT_MS);
  try {
    await fetch(BASE + PATH, { headers, signal: ac.signal });
  } catch {
    /* expected abort */
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  console.log(`firing ${N} aborted requests (abort @ ${ABORT_MS}ms) at ${BASE}${PATH}…`);
  await Promise.all(Array.from({ length: N }, abortedHit));

  console.log("sending final clean request, timing it…");
  const started = Date.now();
  const finalAc = new AbortController();
  const guard = setTimeout(() => finalAc.abort(), 30_000);
  try {
    const res = await fetch(BASE + PATH, { headers, signal: finalAc.signal });
    const ms = Date.now() - started;
    console.log(`final request: ${res.status} in ${ms}ms`);
    if (ms > 5000) {
      console.error("SLOW — pool likely still wedging");
      process.exitCode = 1;
    } else {
      console.log("OK — pool healthy");
    }
  } catch {
    console.error("final request HUNG > 30s — pool exhausted (freeze reproduced)");
    process.exitCode = 1;
  } finally {
    clearTimeout(guard);
  }
}

main();
