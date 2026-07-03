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
