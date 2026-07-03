# Automated Backup + Verified Restore — Design & Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement §14 task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Date: 2026-06-26
Status: Approved design, ready to implement
Owner: lalit.sharma@procurie.com

## 1. Problem

SiteOps is live with real clients on a **free** personal Vercel account + **free** Supabase
tier. Today there is an admin **export** (`/api/admin/export` → consistent JSON snapshot) but:

1. **No scheduled backup.** A wipe = total data loss; recovery depends on someone remembering
   to click the export button.
2. **No restore path at all.** The export JSON has never been proven loadable. A backup you
   cannot restore is not a backup.

This plan adds (a) an unattended every-2-days backup to Google Drive, and (b) a real,
test-proven restore path.

## 2. Constraints & decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Restore scope | **Full restore + automated round-trip test** | Prove retrievability, not assume it. |
| Scheduler | **GitHub Actions running a standalone `tsx` script** | Free; not coupled to Vercel/Supabase; backup survives prod outage. |
| Backup data path | Script connects **directly to Supabase** (`DATABASE_URL`), not via the web app | App can be down and backup still runs. No load on the Next.js runtime. |
| Drive auth | **OAuth refresh token** (NOT service account) | Service accounts have 0 storage quota; consumer Gmail can't create Shared Drives → service account uploads fail with `storageQuotaExceeded`. Refresh token writes to the real account's 15 GB My Drive. |
| Encryption at rest | **Plaintext JSON** (user choice) | Accepted tradeoff. Security now rests on the Drive account → 2FA mandatory (runbook). |
| Compression | **gzip** each backup | Not encryption — just smaller/faster; delays the 15 GB cap by years. |
| Retention | **Keep everything** (user choice) | Simplest. gzip mitigates growth; revisit if cap approached. |
| Restore mode | **Wipe + load into empty DB** (`--mode=wipe`) | Matches the total-loss disaster scenario. |

## 3. Architecture

```
GitHub Actions (cron: 0 2 */2 * *, ~02:00 UTC every 2 days)
        │ runs  tsx scripts/backup.ts
        ▼
 scripts/backup.ts ──DATABASE_URL──► Supabase
        │  readFullSnapshot()  (existing, repeatable-read, FK-coherent)
        │  toBackupJson()      (existing, money-as-string safe)
        │  gzip
        ▼
 lib/backup/drive.ts ──OAuth refresh token──► Google Drive
        └─ upload  siteops-backup-YYYY-MM-DDTHH-mm-ssZ.json.gz  → folder DRIVE_FOLDER_ID

 (independent, run-anywhere — disaster recovery)
 scripts/restore.ts  --file=<path.json.gz|.json>  --mode=wipe  [--yes]
        │  read + gunzip + JSON.parse + validate version
        │  ONE transaction:
        │    TRUNCATE all registry tables RESTART IDENTITY CASCADE
        │    insert per table in TABLE_REGISTRY order (OVERRIDING SYSTEM VALUE for identity PKs)
        │    resync identity sequences (setval to MAX(id))
        ▼
   Supabase (target DB from DATABASE_URL)
```

Reuses the existing, already-tested `lib/export/snapshot.ts`, `serialize.ts`, and
`tableRegistry.ts`. The registry is the single source of truth for *which* tables and *in
what FK order* — both backup and restore consume it.

## 4. Performance & "do not slow the app" guarantees

- **Backup runs off-platform.** It executes in a GitHub runner, hitting Supabase directly.
  Zero CPU/memory on Vercel; the Next.js app never participates.
- **Scheduled at ~02:00 UTC** (07:30 IST is low traffic; 02:00 UTC = 07:30 IST — acceptable,
  or shift to `0 21 */2 * *` = 02:30 IST if preferred; configurable, recorded as an open knob).
- **Read-only, single repeatable-read transaction** already used by `readFullSnapshot`, with a
  `SET LOCAL statement_timeout = 60000`. It takes one pooler connection briefly; the live app's
  pool (`max: 15`) is a *separate* client process and is unaffected.
- **No new code in the web bundle.** `googleapis` and all script code live under `scripts/` and
  `lib/backup/`, imported only by Node scripts — never by a route or React component. Add an
  ESLint/`import` boundary note so `lib/backup/drive.ts` is never pulled into app code.
- **Restore is offline DR only** — never invoked by the running app.

## 5. Components (files)

### New
- `scripts/backup.ts` — orchestrates snapshot → gzip → Drive upload. Standalone entrypoint.
- `scripts/restore.ts` — CLI: `--file`, `--mode=wipe`, `--yes` (skip confirm), `--dry-run`.
- `scripts/get-refresh-token.ts` — one-time local OAuth helper; prints the refresh token.
- `lib/backup/drive.ts` — Drive client: `makeDriveClient(env)`, `uploadFile({name, folderId, body, mimeType})`. Pure wrapper over `googleapis`, mockable.
- `lib/backup/restoreSnapshot.ts` — `restoreSnapshot(parsed, exec?)`: pure insert logic taking an executor (mirrors `snapshot.ts`’s `exec` pattern → testable under the `withRollback` tx harness).
- `lib/backup/backupFile.ts` — naming + parse/validate helpers: `backupFileName(date)`, `parseBackup(buf)` (gunzip-if-needed, JSON parse, assert `version === BACKUP_VERSION`, assert `tables` keys ⊆ registry).
- `.github/workflows/backup.yml` — cron + manual `workflow_dispatch`; runs `scripts/backup.ts`.

### Modified
- `package.json` — add `googleapis` dep; add scripts: `backup`, `restore`, `auth:drive-token`.
- `.env.example` — document new vars.
- Tests (see §9).

### Reused unchanged
- `lib/export/snapshot.ts`, `lib/export/serialize.ts`, `lib/export/tableRegistry.ts`.

## 6. Environment / secrets

| Var | Where | Notes |
|---|---|---|
| `DATABASE_URL` | GitHub secret + local | Supabase **session** pooler (port 5432) preferred for the long read tx; transaction pooler (6543) also works since `prepare:false`. Document which. |
| `GOOGLE_CLIENT_ID` | GitHub secret + local | OAuth Desktop client. |
| `GOOGLE_CLIENT_SECRET` | GitHub secret + local | |
| `GOOGLE_REFRESH_TOKEN` | GitHub secret | From `get-refresh-token.ts`. Scope `drive.file`. |
| `BACKUP_FOLDER_NAME` (optional) | env | Drive folder the script creates/reuses. Default `SiteOps-Backups`. No folder id needed — `drive.file` scope means the script can only see/manage files it created, so it find-or-creates its own folder. |

A `lib/backup/env.ts` validates required vars at script start and **fails fast** with a clear
message naming the missing var (never logs secret values).

## 7. Data-format contract (backup JSON)

```jsonc
{
  "version": 1,                      // BACKUP_VERSION; restore rejects mismatch
  "exportedAt": "2026-06-26T02:00:01.123Z",
  "tables": {
    "user_profiles": [ { /* every column, Date→ISO string, decimal→string, jsonb→object */ } ],
    "...": []                        // all 24 registry tables, in registry order
  }
}
```

Invariants restore depends on:
- **Money/decimal stay strings end-to-end** — never `Number()`-parsed (float drift = corruption).
- **Dates are ISO UTC strings** — Postgres accepts ISO directly on insert into `timestamp`.
- **jsonb stays a JS object/array/null** — inserted as-is.
- **Every registry table present** (possibly empty array). `tableRegistry.test.ts` guards that
  the registry matches `schema.ts`, so no table is silently omitted.

## 8. Implementation plan (phased)

Each phase is independently testable and lands on its own. TDD per repo norm.

### Phase 0 — Deps & boundaries
1. `pnpm add googleapis` (verify it is a *dependency* used only by scripts; confirm not bundled).
2. `lib/backup/env.ts` + tests (missing-var → throws naming the var; present → typed config).
3. Update `.env.example`.
**Done when:** env validation unit tests pass; `googleapis` installed.

### Phase 1 — Restore core (highest-risk first; proves the whole premise)
1. `lib/backup/backupFile.ts`: `parseBackup` (gunzip detection via gzip magic bytes `1f 8b`,
   JSON parse, `version` check, table-key subset check) + `backupFileName`. Unit tests.
2. `lib/backup/restoreSnapshot.ts`: `restoreSnapshot(parsed, exec)`:
   - TRUNCATE every registry table `RESTART IDENTITY CASCADE` (single statement, all tables).
   - For each table **in registry order**: bulk `INSERT` all rows. For tables whose `id` is
     `generatedAlwaysAsIdentity`, emit `OVERRIDING SYSTEM VALUE` so original ids are preserved.
   - After inserts: resync each identity sequence —
     `SELECT setval(pg_get_serial_sequence('<table>','id'), GREATEST(MAX(id),1))` (skip if 0 rows).
   - All inside the caller's transaction.
3. **Round-trip integration test** (`restoreSnapshot.test.ts`) using the existing `withRollback`
   tx harness: seed → `readFullSnapshot` → `toBackupJson` → `parseBackup` → `restoreSnapshot`
   → re-read → deep-equal **per table / per row / per column**. Assert decimal strings byte-equal.
**Done when:** round-trip test green; money/date/jsonb verified identical.

### Phase 2 — Restore CLI
1. `scripts/restore.ts`: arg parse (`--file`, `--mode=wipe`, `--yes`, `--dry-run`), read file,
   `parseBackup`, print summary (per-table row counts), require typed confirmation unless `--yes`,
   run `restoreSnapshot` in one `db.transaction`, print result + elapsed. Non-zero exit on failure.
2. `--dry-run`: parse + validate + print counts, no DB writes.
3. Add `pnpm restore` script.
**Done when:** manual restore into a scratch DB reproduces a seeded dataset exactly.

### Phase 3 — Drive client
1. `lib/backup/drive.ts`: OAuth2 client from refresh token; `uploadFile` (resumable/media upload,
   sets parent folder, returns file id + size). Unit test with mocked `googleapis`.
2. `scripts/get-refresh-token.ts`: loopback OAuth flow (Desktop client) → print refresh token.
**Done when:** mocked upload test passes; token script documented in runbook.

### Phase 4 — Backup orchestration
1. `scripts/backup.ts`: validate env → `readFullSnapshot` → `toBackupJson` → `gzipSync` →
   `uploadFile` → log `{rows, tables, bytes, fileId, elapsedMs}`. Non-zero exit on any failure.
2. Add `pnpm backup` script.
**Done when:** `pnpm backup` against a dev DB produces `*.json.gz` in the Drive folder and a
   `restore --dry-run` of that file validates clean.

### Phase 5 — Schedule
1. `.github/workflows/backup.yml`: `schedule: 0 2 */2 * *` + `workflow_dispatch`; checkout, setup
   node + pnpm, install, `pnpm backup`; secrets injected as env. Concurrency guard so overlapping
   runs can't collide. Job timeout (e.g. 10 min). Failure → workflow fails (GitHub emails owner).
**Done when:** manual `workflow_dispatch` run uploads a backup; restore-dry-run of it passes.

### Phase 6 — Docs / runbook
Finalize §11 runbook in this doc; link it from `README`/admin notes.

## 9. Testing

| Test | Type | Asserts |
|---|---|---|
| `restoreSnapshot.test.ts` round-trip | integration (`withRollback`) | export→import→re-read deep-equal; decimals byte-identical; dates ISO round-trip; jsonb structural equality; empty tables handled. |
| `backupFile.test.ts` | unit | gzip magic-byte detection; version mismatch rejected; unknown table key rejected; valid parse. |
| `env.test.ts` | unit | each missing var throws naming it; no secret values in messages. |
| `drive.test.ts` | unit (mocked googleapis) | correct folder parent, media body, mime; error surfaces. |
| `tableRegistry.test.ts` (existing) | unit | registry == schema (no missing table). |
| Identity-PK reinsert | integration | `audit_logs` (identity id) reinserted with original ids; sequence resynced so a fresh app insert gets `MAX(id)+1`, no collision. |

## 10. Edge cases & error handling

**Backup**
- **Snapshot fails / DB unreachable:** non-zero exit, no partial file uploaded (gzip only after a
  complete snapshot). GitHub marks the run failed → owner notified.
- **Drive upload fails (network/quota/auth):** non-zero exit, logged with the Google error
  reason; no silent success. Retry once with backoff before failing.
- **Refresh token expired** (consent screen left in "Testing" → 7-day expiry): upload 401 →
  clear message pointing to runbook step "Publish consent screen + regenerate token".
- **15 GB cap reached** (eventual, "keep everything"): upload fails with `storageQuotaExceeded`;
  message tells operator to prune old `.json.gz` or enable retention. (Future knob.)
- **Long snapshot vs statement_timeout:** 60 s `SET LOCAL` already in place; if data grows past
  that, raise the constant (single place: `EXPORT_TIMEOUT_MS`). Recorded as a known limit.
- **Clock/zone:** filenames use UTC ISO with `:`→`-` (Drive-safe), so they sort chronologically.
- **Concurrent runs:** workflow `concurrency` group cancels/serializes overlaps.

**Restore**
- **Wrong/old `version`:** reject before any write.
- **Unknown table key in file:** reject (schema drift guard).
- **Missing table key in file:** treat as empty (still TRUNCATE it) — and warn loudly.
- **Identity-PK reinsert (ALL 23 tables):** every table's `id` is `integer … generatedAlwaysAsIdentity`,
  so every insert needs `OVERRIDING SYSTEM VALUE`; then `setval` resync per table — else the next
  live insert collides on `id`. Test enforces this. (Note: `setval` is non-transactional, but it
  resets to the same `MAX(id)` already present → idempotent, safe inside the round-trip test tx.)
- **`.defaultRandom()` uuid business keys:** values come from the backup, defaults don't fire — OK.
- **FK integrity:** TRUNCATE … CASCADE clears children; inserts follow registry (parents-first)
  order. Whole thing in ONE transaction → all-or-nothing; a failure rolls back, DB unchanged.
- **Accidental run against prod:** restore prints target host + total row counts and requires
  typed confirmation (`--yes` to bypass in automation only). `--dry-run` for safe inspection.
- **Huge insert payloads:** chunk bulk inserts (e.g. 1–5k rows/statement) to stay under
  parameter/packet limits; chunking is internal, still within the single tx.
- **jsonb `null` vs `{}`:** preserve exactly (insert raw value, no coercion).
- **Empty database before restore:** TRUNCATE on empty tables is a no-op — fine.

## 11. Operations runbook

### One-time setup (~10 min)
1. **Google Cloud Console** (signed in as the client-dev Google account):
   - New project (or reuse) → **APIs & Services → Enable "Google Drive API"**.
   - **OAuth consent screen**: External, app name, add the client-dev account as a **test user**,
     then **PUBLISH** the app (avoids the 7-day refresh-token expiry that "Testing" status causes).
   - **Credentials → Create OAuth client ID → Application type: Desktop app.** Copy client id + secret.
2. **Target folder:** none to create — the backup script find-or-creates `SiteOps-Backups`
   in the account's Drive on first run (scope `drive.file`).
3. **Get refresh token (local):** `GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… npm run auth:drive-token`
   → opens browser → log in as client-dev account → consent → copy printed `GOOGLE_REFRESH_TOKEN`.
4. **GitHub repo → Settings → Secrets and variables → Actions** → add: `DATABASE_URL`,
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.
5. **Enable 2FA** on the client-dev Google account (backups are plaintext PII — this account *is*
   the security boundary).
6. Trigger a manual run: **Actions → Backup → Run workflow** → confirm a `.json.gz` lands in Drive.

### Disaster recovery
1. Download the latest `siteops-backup-*.json.gz` from the Drive folder.
2. Provision/empty the target Supabase DB; ensure schema is migrated to the matching version
   (run drizzle migrations first — restore loads *data*, not schema).
3. `DATABASE_URL=<target> pnpm restore --file=./siteops-backup-….json.gz --mode=wipe`
   - Review the printed target host + row counts, type the confirmation.
   - Use `--dry-run` first to validate the file without writing.
4. Verify: row counts match the script's summary; spot-check money values and a recent site.

## 12. Out of scope (YAGNI)

- Encryption at rest (chose plaintext).
- Retention/pruning automation (chose keep-everything; gzip mitigates).
- Merge/upsert restore mode (only `--mode=wipe`).
- Restoring Supabase **Auth** users / Storage objects — this backs up application tables only.
  (Recorded as a gap: `auth.users` lives outside the app schema; document that supervisors/users
  must exist in Supabase Auth for FKs on `user_profiles.userId` to resolve after restore.)

## 13. Open knobs (safe defaults chosen, easy to change)
- Cron time: `0 2 */2 * *` (default). Shift if 07:30 IST is undesirable.
- Insert chunk size: 2000 rows (tune if needed).
- Snapshot timeout: `EXPORT_TIMEOUT_MS = 60_000` (single source).

---

## 14. Detailed task-by-task implementation plan (TDD)

**Conventions for the implementing engineer (zero codebase context assumed):**
- Tests use **vitest**. Run all: `pnpm test`. Run one file: `pnpm test <path>`.
- DB integration tests use the existing harness in `lib/db/testing.ts`: `describeDb` (auto-skips
  when `DATABASE_URL` unset), `withRollback(async (tx) => …)` (runs in a transaction that is always
  rolled back), and `seedSite(tx)` → `{ userId, siteId }`. **Always** pass `tx` to readers/writers
  inside `withRollback`, or they hit the global pool and can't see uncommitted seed rows.
- Path alias `@/` → repo root of `SiteOps-Web`.
- Scripts run with tsx: `node --import tsx <file>` (see existing `db:audit` script).
- Lint/typecheck: `pnpm lint` (`tsc --noEmit`). Money/decimal columns are **strings** — never
  `Number()` them. `snapshot` returns rows keyed by **camelCase JS names** (e.g. `wagePerHead`),
  not DB column names.
- Commit after every green task. Repo is not currently a git repo; if `git status` errors, run
  `git init` first (one-time), otherwise commit normally.

### Task 0: Add dependency + npm scripts

**Files:** Modify `package.json`

- [ ] **Step 1:** Install googleapis as a runtime dep (used only by scripts, never imported by app/route code).

```bash
pnpm add googleapis
```

- [ ] **Step 2:** Add scripts to `package.json` `"scripts"`:

```jsonc
"backup": "node --import tsx scripts/backup.ts",
"restore": "node --import tsx scripts/restore.ts",
"auth:drive-token": "node --import tsx scripts/get-refresh-token.ts"
```

- [ ] **Step 3:** Verify install + typecheck still pass.

Run: `pnpm lint`
Expected: PASS (no errors).

- [ ] **Step 4:** Commit.

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add googleapis dep + backup/restore scripts"
```

### Task 1: Env loader (`lib/backup/env.ts`)

**Files:** Create `lib/backup/env.ts`, Test `lib/backup/env.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// lib/backup/env.test.ts
import { describe, expect, it } from "vitest";
import { requireEnv } from "./env";

describe("requireEnv", () => {
  it("returns the requested vars when all present", () => {
    const out = requireEnv(["A", "B"], { A: "1", B: "2", C: "3" });
    expect(out).toEqual({ A: "1", B: "2" });
  });

  it("throws naming every missing var, without leaking values", () => {
    expect(() => requireEnv(["A", "B", "C"], { A: "1", B: "  " })).toThrowError(
      /Missing required environment variables: B, C/,
    );
  });
});
```

- [ ] **Step 2: Run, verify it fails.**

Run: `pnpm test lib/backup/env.test.ts`
Expected: FAIL — `requireEnv` not found.

- [ ] **Step 3: Implement.**

```ts
// lib/backup/env.ts
// Fail-fast env validation for backup/restore scripts. Never logs values.
export function requireEnv<K extends string>(
  keys: readonly K[],
  src: NodeJS.ProcessEnv = process.env,
): Record<K, string> {
  const missing = keys.filter((k) => !src[k] || src[k]!.trim() === "");
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  return Object.fromEntries(keys.map((k) => [k, src[k]!.trim()])) as Record<K, string>;
}

export const BACKUP_ENV_KEYS = [
  "DATABASE_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "DRIVE_FOLDER_ID",
] as const;
```

- [ ] **Step 4: Run, verify pass.** `pnpm test lib/backup/env.test.ts` → PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/backup/env.ts lib/backup/env.test.ts
git commit -m "feat: fail-fast env loader for backup scripts"
```

### Task 2: Backup file naming + parse/validate (`lib/backup/backupFile.ts`)

**Files:** Create `lib/backup/backupFile.ts`, Test `lib/backup/backupFile.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// lib/backup/backupFile.test.ts
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { BACKUP_VERSION } from "@/lib/export/serialize";
import { backupFileName, parseBackup } from "./backupFile";

const valid = JSON.stringify({
  version: BACKUP_VERSION,
  exportedAt: "2026-06-26T02:00:00.000Z",
  tables: { user_profiles: [], sites: [] },
});

describe("backupFileName", () => {
  it("is Drive-safe (no colons) and sorts chronologically", () => {
    const name = backupFileName(new Date("2026-06-26T02:03:04.000Z"));
    expect(name).toBe("siteops-backup-2026-06-26T02-03-04Z.json.gz");
    expect(name).not.toContain(":");
  });
});

describe("parseBackup", () => {
  it("parses plain JSON buffer", () => {
    expect(parseBackup(Buffer.from(valid)).tables.sites).toEqual([]);
  });
  it("parses gzipped buffer (magic-byte detection)", () => {
    expect(parseBackup(gzipSync(Buffer.from(valid))).version).toBe(BACKUP_VERSION);
  });
  it("rejects an unsupported version", () => {
    const bad = JSON.stringify({ version: 999, exportedAt: "x", tables: {} });
    expect(() => parseBackup(Buffer.from(bad))).toThrowError(/Unsupported backup version 999/);
  });
  it("rejects unknown table keys (schema-drift guard)", () => {
    const bad = JSON.stringify({ version: BACKUP_VERSION, exportedAt: "x", tables: { nope: [] } });
    expect(() => parseBackup(Buffer.from(bad))).toThrowError(/unknown tables: nope/);
  });
});
```

- [ ] **Step 2: Run, verify fail.** `pnpm test lib/backup/backupFile.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement.**

```ts
// lib/backup/backupFile.ts
// File naming + parse/validate for the JSON(.gz) backup. Pure, no IO beyond gunzip.
import { gunzipSync } from "node:zlib";
import { BACKUP_VERSION } from "@/lib/export/serialize";
import { TABLE_KEYS } from "@/lib/export/tableRegistry";

export type BackupRow = Record<string, unknown>;
export type Backup = {
  version: number;
  exportedAt: string;
  tables: Record<string, BackupRow[]>;
};

// Drive filenames can't contain ':'. Keep ISO ordering by replacing ':' with '-'
// and trimming millis. e.g. siteops-backup-2026-06-26T02-03-04Z.json.gz
export function backupFileName(date = new Date()): string {
  const iso = date.toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
  return `siteops-backup-${iso}.json.gz`;
}

export function parseBackup(buf: Buffer): Backup {
  const isGzip = buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  const text = (isGzip ? gunzipSync(buf) : buf).toString("utf8");
  const parsed = JSON.parse(text) as Backup;

  if (parsed.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version ${parsed.version}; expected ${BACKUP_VERSION}`);
  }
  if (!parsed.tables || typeof parsed.tables !== "object") {
    throw new Error("Backup is missing a 'tables' object");
  }
  const allowed = new Set<string>(TABLE_KEYS);
  const unknown = Object.keys(parsed.tables).filter((k) => !allowed.has(k));
  if (unknown.length) throw new Error(`Backup has unknown tables: ${unknown.join(", ")}`);

  return parsed;
}
```

- [ ] **Step 4: Run, verify pass.** → PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/backup/backupFile.ts lib/backup/backupFile.test.ts
git commit -m "feat: backup file naming + parse/validate with gzip detection"
```

### Task 3: Restore core (`lib/backup/restoreSnapshot.ts`) — the heart of the feature

**Files:** Create `lib/backup/restoreSnapshot.ts`, Test `lib/backup/restoreSnapshot.test.ts`

Approach: ALL 23 registry tables have a `generatedAlwaysAsIdentity` integer `id`, so every insert
uses `OVERRIDING SYSTEM VALUE`. Steps inside one transaction: TRUNCATE all (CASCADE, RESTART
IDENTITY) → insert per table in registry (parents-first) order → resync each `id` sequence.
Inserts are built as raw parameterized SQL so Postgres coerces ISO-strings→timestamp,
decimal-strings→numeric, and jsonb is cast explicitly. Rows are keyed by camelCase JS names; map
to DB column names + types via `getTableColumns`.

- [ ] **Step 1: Write the failing round-trip test.**

```ts
// lib/backup/restoreSnapshot.test.ts
import { expect, it } from "vitest";
import { labourEntries } from "@/lib/db/schema";
import { describeDb, seedSite, withRollback } from "@/lib/db/testing";
import { readFullSnapshot } from "@/lib/export/snapshot";
import { toBackupJson } from "@/lib/export/serialize";
import { TABLE_KEYS } from "@/lib/export/tableRegistry";
import { parseBackup } from "./backupFile";
import { restoreSnapshot } from "./restoreSnapshot";

describeDb("restoreSnapshot round-trip (DB)", () => {
  it("export -> restore -> re-read reproduces every row/column exactly", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      await tx.insert(labourEntries).values([
        { siteId, date: "2026-06-22", peopleCount: 4, wagePerHead: "500.50", createdBy: userId },
        { siteId, date: "2026-06-23", peopleCount: 2, salaryAmount: "-500.50", createdBy: userId },
      ]);

      // Capture the pre-restore snapshot (this is what the backup file holds).
      const before = await readFullSnapshot(tx);
      const json = toBackupJson(before, TABLE_KEYS);
      const parsed = parseBackup(Buffer.from(json));

      // Wipe + reload everything from the parsed backup, in the same tx.
      await restoreSnapshot(parsed, tx);

      const after = await readFullSnapshot(tx);

      // Compare table-by-table as sets keyed by id (insert order may differ).
      const byId = (rows: Record<string, unknown>[]) =>
        Object.fromEntries(rows.map((r) => [String(r.id), r]));
      for (const key of TABLE_KEYS) {
        expect(byId(after[key])).toEqual(byId(before[key]));
      }

      // Decimal stayed a byte-identical string (no float drift).
      const lab = after.labour_entries.find((r) => r.salaryAmount != null);
      expect(lab?.salaryAmount).toBe("-500.50");
    });
  });

  it("resyncs the identity sequence so a fresh insert does not collide", async () => {
    await withRollback(async (tx) => {
      const { userId, siteId } = await seedSite(tx);
      await tx.insert(labourEntries).values({
        siteId, date: "2026-06-22", peopleCount: 1, wagePerHead: "1.00", createdBy: userId,
      });
      const before = await readFullSnapshot(tx);
      await restoreSnapshot(before as never, tx);

      // A new insert must succeed (sequence was bumped past the restored MAX(id)).
      await expect(
        tx.insert(labourEntries).values({
          siteId, date: "2026-06-24", peopleCount: 1, wagePerHead: "2.00", createdBy: userId,
        }),
      ).resolves.toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run, verify fail.** `pnpm test lib/backup/restoreSnapshot.test.ts` → FAIL (module not found). (If `DATABASE_URL` is unset the suite SKIPS — set it to your dev DB to actually run it.)

- [ ] **Step 3: Implement.**

```ts
// lib/backup/restoreSnapshot.ts
// Wipe-and-reload restore. Reverses lib/export/snapshot.ts: takes a parsed backup
// and writes it back. Runs on the passed executor (a tx) so it is testable under
// withRollback and atomic in production (all-or-nothing).
import { getTableColumns, getTableName, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Backup, BackupRow } from "./backupFile";
import { TABLE_REGISTRY } from "@/lib/export/tableRegistry";
import { db } from "@/lib/db/client";

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
const CHUNK = 2000; // rows per INSERT, to stay under bind-parameter / packet limits

type ColMeta = { js: string; name: string; isJson: boolean };

function columnsOf(table: (typeof TABLE_REGISTRY)[number]["table"]): ColMeta[] {
  const cols = getTableColumns(table) as Record<string, PgColumn>;
  return Object.entries(cols).map(([js, col]) => ({
    js,
    name: col.name,
    isJson: col.dataType === "json",
  }));
}

function insertChunk(tableName: string, cols: ColMeta[], rows: BackupRow[]) {
  const colList = sql.join(cols.map((c) => sql.identifier(c.name)), sql`, `);
  const tuples = rows.map(
    (row) =>
      sql`(${sql.join(
        cols.map((c) => {
          const v = row[c.js];
          if (v === null || v === undefined) return sql`NULL`;
          // jsonb must be cast; everything else binds as a param and Postgres
          // coerces (ISO string -> timestamp, decimal string -> numeric, etc.)
          return c.isJson ? sql`${JSON.stringify(v)}::jsonb` : sql`${v}`;
        }),
        sql`, `,
      )})`,
  );
  return sql`INSERT INTO ${sql.identifier(tableName)} (${colList}) OVERRIDING SYSTEM VALUE VALUES ${sql.join(tuples, sql`, `)}`;
}

export async function restoreSnapshot(backup: Backup, exec: Executor): Promise<void> {
  const tableNames = TABLE_REGISTRY.map((e) => getTableName(e.table));

  // 1) Wipe everything. CASCADE clears FK children; RESTART IDENTITY resets seqs.
  const truncTargets = sql.join(
    tableNames.map((n) => sql.identifier(n)),
    sql`, `,
  );
  await exec.execute(sql`TRUNCATE ${truncTargets} RESTART IDENTITY CASCADE`);

  // 2) Insert parents-first (registry order), chunked, with OVERRIDING SYSTEM VALUE.
  for (const entry of TABLE_REGISTRY) {
    const name = getTableName(entry.table);
    const rows = backup.tables[entry.key] ?? [];
    if (rows.length === 0) continue;
    const cols = columnsOf(entry.table);
    for (let i = 0; i < rows.length; i += CHUNK) {
      await exec.execute(insertChunk(name, cols, rows.slice(i, i + CHUNK)));
    }
  }

  // 3) Resync identity sequences so the next live insert won't collide on id.
  for (const name of tableNames) {
    await exec.execute(
      sql`SELECT setval(pg_get_serial_sequence(${name}, 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM ${sql.identifier(name)}), 1))`,
    );
  }
}
```

- [ ] **Step 4: Run, verify pass.** Set `DATABASE_URL` to a dev DB, then `pnpm test lib/backup/restoreSnapshot.test.ts` → PASS. If a timestamp/jsonb column fails to coerce, that's the test doing its job — fix the cast in `insertChunk` (e.g. add a column-type branch) and re-run.

- [ ] **Step 5: Commit.**

```bash
git add lib/backup/restoreSnapshot.ts lib/backup/restoreSnapshot.test.ts
git commit -m "feat: wipe-and-reload restoreSnapshot with round-trip test"
```

### Task 4: Drive client (`lib/backup/drive.ts`)

**Files:** Create `lib/backup/drive.ts`, Test `lib/backup/drive.test.ts`

- [ ] **Step 1: Write the failing test (mock googleapis).**

```ts
// lib/backup/drive.test.ts
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

const create = vi.fn().mockResolvedValue({ data: { id: "file123", size: "42" } });
vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    drive: () => ({ files: { create } }),
  },
}));

import { uploadFile } from "./drive";

describe("uploadFile", () => {
  it("uploads into the target folder and returns id + size", async () => {
    const res = await uploadFile(
      { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s", GOOGLE_REFRESH_TOKEN: "r" },
      { name: "b.json.gz", folderId: "folderX", body: Readable.from(["x"]), mimeType: "application/gzip" },
    );
    expect(res).toEqual({ id: "file123", size: 42 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ name: "b.json.gz", parents: ["folderX"] }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run, verify fail.** → FAIL (module not found).

- [ ] **Step 3: Implement.**

```ts
// lib/backup/drive.ts
// Minimal Google Drive client for unattended backup uploads. OAuth refresh-token
// auth (consumer Gmail friendly — files land in the account's 15GB My Drive).
// Imported ONLY by scripts — never by app/route/React code (keeps it out of the bundle).
import type { Readable } from "node:stream";
import { google } from "googleapis";

type DriveAuthEnv = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
};

function driveClient(env: DriveAuthEnv) {
  const auth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });
  return google.drive({ version: "v3", auth });
}

export async function uploadFile(
  env: DriveAuthEnv,
  file: { name: string; folderId: string; body: Readable; mimeType: string },
): Promise<{ id: string; size: number }> {
  const drive = driveClient(env);
  const res = await drive.files.create({
    requestBody: { name: file.name, parents: [file.folderId] },
    media: { mimeType: file.mimeType, body: file.body },
    fields: "id, size",
    supportsAllDrives: true,
  });
  const id = res.data.id;
  if (!id) throw new Error("Drive upload returned no file id");
  return { id, size: Number(res.data.size ?? 0) };
}
```

- [ ] **Step 4: Run, verify pass.** → PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/backup/drive.ts lib/backup/drive.test.ts
git commit -m "feat: google drive upload client (oauth refresh token)"
```

### Task 5: One-time OAuth token helper (`scripts/get-refresh-token.ts`)

**Files:** Create `scripts/get-refresh-token.ts` (no automated test — interactive, manually verified)

- [ ] **Step 1: Implement the loopback OAuth flow.**

```ts
// scripts/get-refresh-token.ts
// One-time helper: prints a Google refresh token for the Drive backup.
// Run: GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… pnpm auth:drive-token
import { createServer } from "node:http";
import { google } from "googleapis";
import { requireEnv } from "@/lib/backup/env";

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = requireEnv([
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
]);
const PORT = 53682;
const redirect = `http://localhost:${PORT}`;
const oauth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirect);

const url = oauth.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // force a refresh_token even on re-auth
  scope: ["https://www.googleapis.com/auth/drive.file"],
});

const server = createServer(async (req, res) => {
  const code = new URL(req.url!, redirect).searchParams.get("code");
  if (!code) {
    res.end("No code");
    return;
  }
  const { tokens } = await oauth.getToken(code);
  res.end("Done — return to your terminal.");
  server.close();
  console.log("\nGOOGLE_REFRESH_TOKEN=", tokens.refresh_token, "\n");
  if (!tokens.refresh_token) {
    console.error("No refresh_token returned. Revoke prior access and retry with prompt=consent.");
  }
});

server.listen(PORT, () => {
  console.log("Add this redirect URI to your OAuth client:", redirect);
  console.log("Open this URL, log in as the client-dev account:\n", url);
});
```

- [ ] **Step 2: Lint.** `pnpm lint` → PASS.

- [ ] **Step 3: Manual verification (documented, not automated):** with a real Desktop OAuth client created per §11, run `pnpm auth:drive-token`, complete consent, confirm a `GOOGLE_REFRESH_TOKEN=…` prints. Note: the OAuth client must list `http://localhost:53682` as an authorized redirect URI.

- [ ] **Step 4: Commit.**

```bash
git add scripts/get-refresh-token.ts
git commit -m "feat: one-time oauth refresh-token helper script"
```

### Task 6: Backup orchestration script (`scripts/backup.ts`)

**Files:** Create `scripts/backup.ts` (manually verified end-to-end)

- [ ] **Step 1: Implement.**

```ts
// scripts/backup.ts
// Standalone backup: snapshot Supabase -> gzip JSON -> upload to Drive.
// Run: pnpm backup   (needs DATABASE_URL + GOOGLE_* + DRIVE_FOLDER_ID)
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { requireEnv, BACKUP_ENV_KEYS } from "@/lib/backup/env";
import { backupFileName } from "@/lib/backup/backupFile";
import { uploadFile } from "@/lib/backup/drive";
import { readFullSnapshot } from "@/lib/export/snapshot";
import { toBackupJson } from "@/lib/export/serialize";
import { TABLE_KEYS } from "@/lib/export/tableRegistry";

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`${label} failed once, retrying in 3s:`, e instanceof Error ? e.message : e);
    await new Promise((r) => setTimeout(r, 3000));
    return fn();
  }
}

async function main() {
  const env = requireEnv(BACKUP_ENV_KEYS);
  const startedAt = Date.now();

  const snapshot = await readFullSnapshot(); // production path: own repeatable-read tx
  const json = toBackupJson(snapshot, TABLE_KEYS);
  const gz = gzipSync(Buffer.from(json));
  const rows = Object.values(snapshot).reduce((n, r) => n + r.length, 0);
  const name = backupFileName();

  const { id, size } = await withRetry(
    () =>
      uploadFile(env, {
        name,
        folderId: env.DRIVE_FOLDER_ID,
        body: Readable.from(gz),
        mimeType: "application/gzip",
      }),
    "Drive upload",
  );

  console.log(
    JSON.stringify({
      ok: true,
      file: name,
      fileId: id,
      tables: TABLE_KEYS.length,
      rows,
      bytes: size,
      elapsedMs: Date.now() - startedAt,
    }),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("BACKUP FAILED:", e instanceof Error ? e.stack : e);
    process.exit(1);
  });
```

- [ ] **Step 2: Lint.** `pnpm lint` → PASS.

- [ ] **Step 3: Manual end-to-end verification:** with all env vars set, run `pnpm backup`. Expected: a `siteops-backup-*.json.gz` appears in the Drive folder and stdout prints `{"ok":true,…,"rows":N}`.

- [ ] **Step 4: Commit.**

```bash
git add scripts/backup.ts
git commit -m "feat: backup script (snapshot -> gzip -> drive)"
```

### Task 7: Restore CLI (`scripts/restore.ts`)

**Files:** Create `scripts/restore.ts` (manually verified)

- [ ] **Step 1: Implement.**

```ts
// scripts/restore.ts
// Disaster recovery: load a backup .json(.gz) into the DATABASE_URL target.
// Run: pnpm restore --file=./siteops-backup-….json.gz --mode=wipe [--yes] [--dry-run]
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { db } from "@/lib/db/client";
import { requireEnv } from "@/lib/backup/env";
import { parseBackup } from "@/lib/backup/backupFile";
import { restoreSnapshot } from "@/lib/backup/restoreSnapshot";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  requireEnv(["DATABASE_URL"]);
  const file = arg("file");
  const mode = arg("mode") ?? "wipe";
  if (!file) throw new Error("Missing --file=<path to backup .json or .json.gz>");
  if (mode !== "wipe") throw new Error(`Unsupported --mode=${mode} (only 'wipe' is implemented)`);

  const backup = parseBackup(readFileSync(file));
  const counts = Object.fromEntries(
    Object.entries(backup.tables).map(([k, v]) => [k, v.length]),
  );
  const host = (process.env.DATABASE_URL!.match(/@([^/:]+)/)?.[1]) ?? "unknown-host";
  console.log(`Backup exportedAt=${backup.exportedAt}`);
  console.log(`Target host: ${host}`);
  console.table(counts);

  if (flag("dry-run")) {
    console.log("Dry run — validated, no writes performed.");
    return;
  }

  if (!flag("yes")) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ans = await rl.question(`This WIPES and reloads ${host}. Type the host to confirm: `);
    rl.close();
    if (ans.trim() !== host) throw new Error("Confirmation did not match — aborted.");
  }

  const startedAt = Date.now();
  await db.transaction((tx) => restoreSnapshot(backup, tx));
  console.log(JSON.stringify({ ok: true, host, elapsedMs: Date.now() - startedAt }));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("RESTORE FAILED:", e instanceof Error ? e.stack : e);
    process.exit(1);
  });
```

- [ ] **Step 2: Lint.** `pnpm lint` → PASS.

- [ ] **Step 3: Manual verification:** `pnpm restore --file=<a backup> --dry-run` prints per-table counts and writes nothing. Against a scratch DB: `pnpm restore --file=<backup> --mode=wipe --yes` reloads, exits 0, row counts match.

- [ ] **Step 4: Commit.**

```bash
git add scripts/restore.ts
git commit -m "feat: restore CLI (wipe + reload, dry-run, typed confirm)"
```

### Task 8: GitHub Actions schedule (`.github/workflows/backup.yml`)

**Files:** Create `.github/workflows/backup.yml`

- [ ] **Step 1: Implement.**

```yaml
# .github/workflows/backup.yml
name: Backup
on:
  schedule:
    - cron: "0 2 */2 * *" # ~02:00 UTC every 2 days (see plan §13 for timing knob)
  workflow_dispatch: {} # allow manual "Run workflow"
concurrency:
  group: siteops-backup
  cancel-in-progress: false
jobs:
  backup:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    defaults:
      run:
        working-directory: SiteOps-Web
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: SiteOps-Web/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm backup
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
          GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}
          GOOGLE_REFRESH_TOKEN: ${{ secrets.GOOGLE_REFRESH_TOKEN }}
          DRIVE_FOLDER_ID: ${{ secrets.DRIVE_FOLDER_ID }}
```

> Adjust `working-directory` / `cache-dependency-path` if the repo root differs. If the workflow
> lives in a repo where `SiteOps-Web` is the root, drop the `SiteOps-Web` path segments.

- [ ] **Step 2: Commit.**

```bash
git add .github/workflows/backup.yml
git commit -m "ci: schedule backup every 2 days + manual dispatch"
```

- [ ] **Step 3: Manual verification (post-setup):** after secrets are added per §11, trigger
  **Actions → Backup → Run workflow**; confirm green run + a new file in Drive; download it and run
  `pnpm restore --file=<that file> --dry-run` to confirm it parses.

### Task 9: Docs + env example

**Files:** Modify `.env.example`; this design doc already carries the runbook (§11).

- [ ] **Step 1:** Append to `.env.example`:

```bash
# --- Automated backup (scripts/backup.ts, GitHub Actions) ---
# DATABASE_URL is already defined above; the backup reuses it.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
DRIVE_FOLDER_ID=
```

- [ ] **Step 2:** Commit.

```bash
git add .env.example
git commit -m "docs: document backup env vars"
```

### Self-review (completed during planning)

- **Spec coverage:** every §5 component → a task (env→T1, backupFile→T2, restoreSnapshot→T3,
  drive→T4, get-refresh-token→T5, backup→T6, restore→T7, workflow→T8, env.example→T9, deps→T0).
  §9 tests → T1–T4 + the T3 round-trip + sequence-resync test. §11 runbook lives in the doc.
- **No placeholders:** every code/test step has real content.
- **Type consistency:** `requireEnv`, `parseBackup`/`Backup`, `restoreSnapshot(backup, exec)`,
  `uploadFile(env, file)`, `backupFileName()` names/signatures match across tasks.
- **Known execution risk (flagged, not a blocker):** if any `timestamp`/`date` column rejects an
  ISO-string param in `insertChunk`, add a per-column cast branch — the T3 round-trip test will
  catch it before it ships. This is the one spot most likely to need a tweak during execution.
