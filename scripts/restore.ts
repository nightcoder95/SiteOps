// scripts/restore.ts
// Disaster recovery: load a backup .json(.gz) into the DATABASE_URL target.
// Run: npm run restore -- --file=./siteops-backup-….json.gz --mode=wipe [--yes] [--dry-run]
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

import { parseBackup } from "@/lib/backup/backupFile";
import { requireEnv } from "@/lib/backup/env";
import { restoreSnapshot } from "@/lib/backup/restoreSnapshot";
import { db } from "@/lib/db/client";

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
  const counts = Object.fromEntries(Object.entries(backup.tables).map(([k, v]) => [k, v.length]));
  const host = process.env.DATABASE_URL!.match(/@([^/:]+)/)?.[1] ?? "unknown-host";
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
