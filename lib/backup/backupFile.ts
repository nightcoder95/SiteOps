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
