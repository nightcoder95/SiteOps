// lib/backup/drive.test.ts
import { Readable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn().mockResolvedValue({ data: { id: "file123", size: "42" } });
const list = vi.fn();
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    drive: () => ({ files: { create, list } }),
  },
}));

import { getOrCreateFolder, uploadFile } from "./drive";

const ENV = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s", GOOGLE_REFRESH_TOKEN: "r" };

beforeEach(() => {
  create.mockClear();
  list.mockReset();
});

describe("uploadFile", () => {
  it("uploads into the target folder and returns id + size", async () => {
    const res = await uploadFile(ENV, {
      name: "b.json.gz",
      folderId: "folderX",
      body: Readable.from(["x"]),
      mimeType: "application/gzip",
    });
    expect(res).toEqual({ id: "file123", size: 42 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ name: "b.json.gz", parents: ["folderX"] }),
      }),
    );
  });
});

describe("getOrCreateFolder", () => {
  it("reuses an existing folder it previously created", async () => {
    list.mockResolvedValue({ data: { files: [{ id: "existing1" }] } });
    expect(await getOrCreateFolder(ENV, "SiteOps-Backups")).toBe("existing1");
    expect(create).not.toHaveBeenCalled();
  });

  it("creates the folder when none exists", async () => {
    list.mockResolvedValue({ data: { files: [] } });
    create.mockResolvedValueOnce({ data: { id: "new1" } });
    expect(await getOrCreateFolder(ENV, "SiteOps-Backups")).toBe("new1");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: { name: "SiteOps-Backups", mimeType: "application/vnd.google-apps.folder" },
      }),
    );
  });
});
