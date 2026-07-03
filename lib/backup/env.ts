// lib/backup/env.ts
// Fail-fast env validation for backup/restore scripts. Never logs values.
export function requireEnv<K extends string>(
  keys: readonly K[],
  src: Record<string, string | undefined> = process.env,
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
] as const;

// Drive folder the backup script creates/reuses (scope: drive.file). Override via env.
export const BACKUP_FOLDER_NAME = process.env.BACKUP_FOLDER_NAME?.trim() || "SiteOps-Backups";
