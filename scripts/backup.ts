// scripts/backup.ts
// Standalone backup: snapshot Supabase -> gzip JSON -> upload to Drive.
// Run: npm run backup   (needs DATABASE_URL + GOOGLE_* + DRIVE_FOLDER_ID)
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";

import { backupFileName } from "@/lib/backup/backupFile";
import { getOrCreateFolder, uploadFile } from "@/lib/backup/drive";
import { BACKUP_ENV_KEYS, BACKUP_FOLDER_NAME, requireEnv } from "@/lib/backup/env";
import { toBackupJson } from "@/lib/export/serialize";
import { readFullSnapshot } from "@/lib/export/snapshot";
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

  const folderId = await withRetry(
    () => getOrCreateFolder(env, BACKUP_FOLDER_NAME),
    "Drive folder lookup",
  );
  const { id, size } = await withRetry(
    () =>
      uploadFile(env, {
        name,
        folderId,
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
