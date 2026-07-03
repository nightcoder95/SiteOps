// scripts/get-refresh-token.ts
// One-time helper: prints a Google refresh token for the Drive backup.
// Run: GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… npm run auth:drive-token
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
