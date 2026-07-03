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

const FOLDER_MIME = "application/vnd.google-apps.folder";

function driveClient(env: DriveAuthEnv) {
  const auth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });
  return google.drive({ version: "v3", auth });
}

// Find-or-create the backup folder. With the `drive.file` scope, list() only
// returns files this app created, so it reliably re-finds the folder it made on a
// previous run (and creates it the first time). No manual folder id needed.
export async function getOrCreateFolder(env: DriveAuthEnv, name: string): Promise<string> {
  const drive = driveClient(env);
  const found = await drive.files.list({
    q: `mimeType='${FOLDER_MIME}' and name='${name.replace(/'/g, "\\'")}' and trashed=false`,
    fields: "files(id)",
    pageSize: 1,
  });
  const existing = found.data.files?.[0]?.id;
  if (existing) return existing;

  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME },
    fields: "id",
  });
  if (!created.data.id) throw new Error("Failed to create Drive backup folder");
  return created.data.id;
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
