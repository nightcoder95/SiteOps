import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ERROR_CODES } from "@/lib/errors/codes";

import { GET } from "./route";

const { mockRequireCapability, mockReadTable, mockScheduleAudit, mockBuildDir } = vi.hoisted(() => ({
  mockRequireCapability: vi.fn(),
  mockReadTable: vi.fn(),
  mockScheduleAudit: vi.fn(),
  mockBuildDir: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireCapability: mockRequireCapability }));
vi.mock("@/lib/export/snapshot", () => ({ readTable: mockReadTable }));
vi.mock("@/lib/export/userDirectory", () => ({ buildUserDirectory: mockBuildDir }));
vi.mock("@/lib/audit/log", () => ({ scheduleAudit: mockScheduleAudit }));
vi.mock("@/lib/utils/requestId", () => ({ generateRequestId: () => "req_test" }));

function call(table: string) {
  const req = new NextRequest(`http://localhost/api/admin/export/${table}`);
  return GET(req, { params: Promise.resolve({ table }) });
}

describe("GET /api/admin/export/[table]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns CSV with a header row for an admin + valid table, audited", async () => {
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "admin1", role: "Admin" } } });
    mockReadTable.mockResolvedValue({
      rows: [{ siteId: "s1", name: "Site A" }],
      columns: ["siteId", "name"],
    });

    const res = await call("sites");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="siteops-sites-.*\.csv"/);

    const text = await res.text();
    expect(text.split("\r\n")[0]).toBe("siteId,name");
    expect(text).toContain("s1,Site A");
    expect(mockReadTable).toHaveBeenCalledWith("sites");
    expect(mockScheduleAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "data.export.table", resourceId: "sites", allowed: true }),
    );
  });

  it("curates the CSV: drops noise columns and resolves user ids to 'Name (Role)'", async () => {
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "admin1", role: "Admin" } } });
    mockReadTable.mockResolvedValue({
      rows: [{ id: 1, name: "Materials", icon: null, purpose: "operation", createdBy: "u-admin" }],
      columns: ["id", "name", "icon", "purpose", "createdBy"],
    });
    mockBuildDir.mockResolvedValue(new Map([["u-admin", { role: "Admin", label: "Bharath" }]]));

    const res = await call("categories");
    const text = await res.text();
    const header = text.split("\r\n")[0];
    expect(header).toBe("id,name,createdBy"); // icon + purpose dropped
    expect(text).toContain("Bharath (Admin)"); // createdBy resolved
    expect(mockBuildDir).toHaveBeenCalled();
  });

  it("does not build the user directory for a table with no user-id columns", async () => {
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "admin1", role: "Admin" } } });
    mockReadTable.mockResolvedValue({ rows: [{ id: 1, name: "x" }], columns: ["id", "name"] });
    await call("unit_master");
    expect(mockBuildDir).not.toHaveBeenCalled();
  });

  it("rejects an unknown table with 400 (allowlist, never reaches SQL)", async () => {
    mockRequireCapability.mockResolvedValue({ session: { user: { id: "admin1", role: "Admin" } } });
    const res = await call("__nope__");
    expect(res.status).toBe(400);
    expect(mockReadTable).not.toHaveBeenCalled();
    expect(mockScheduleAudit).not.toHaveBeenCalled();
  });

  it("denies a supervisor with 403 before reading", async () => {
    mockRequireCapability.mockResolvedValue({ error: ERROR_CODES.FORBIDDEN, status: 403 });
    const res = await call("sites");
    expect(res.status).toBe(403);
    expect(mockReadTable).not.toHaveBeenCalled();
  });
});
