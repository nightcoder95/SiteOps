import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSession, mockScheduleAudit } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockScheduleAudit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  safeGetSessionFromHeaders: mockSession,
}));

vi.mock("@/lib/audit/log", () => ({
  scheduleAudit: mockScheduleAudit,
}));

import { requireAdmin, requireCapability, requireSiteAccess } from "@/lib/auth/guards";

function req() {
  return new NextRequest("http://localhost/api/x", { method: "GET" });
}

describe("requireCapability", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401s when there is no session", async () => {
    mockSession.mockReturnValue(null);
    const res = await requireCapability(req(), "user:create");
    expect(res).toMatchObject({ error: "UNAUTHORIZED", status: 401 });
    expect(mockScheduleAudit).not.toHaveBeenCalled();
  });

  it("allows when the role holds the capability", async () => {
    mockSession.mockReturnValue({ user: { id: "a1", role: "Admin", email: "" } });
    const res = await requireCapability(req(), "user:create");
    expect("session" in res).toBe(true);
    expect(mockScheduleAudit).not.toHaveBeenCalled();
  });

  it("403s and audits a denial when the role lacks the capability", async () => {
    mockSession.mockReturnValue({ user: { id: "s1", role: "Supervisor", email: "" } });
    const res = await requireCapability(req(), "user:create");
    expect(res).toMatchObject({ error: "FORBIDDEN", status: 403 });
    expect(mockScheduleAudit).toHaveBeenCalledTimes(1);
    expect(mockScheduleAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "permission.denied", allowed: false, role: "Supervisor" }),
    );
  });
});

describe("wrappers preserve prior gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requireAdmin allows Admin, denies Supervisor", async () => {
    mockSession.mockReturnValue({ user: { id: "a1", role: "Admin", email: "" } });
    expect("session" in (await requireAdmin(req()))).toBe(true);

    mockSession.mockReturnValue({ user: { id: "s1", role: "Supervisor", email: "" } });
    expect(await requireAdmin(req())).toMatchObject({ status: 403 });
  });

  it("requireSiteAccess allows both roles", async () => {
    mockSession.mockReturnValue({ user: { id: "a1", role: "Admin", email: "" } });
    expect("session" in (await requireSiteAccess(req()))).toBe(true);

    mockSession.mockReturnValue({ user: { id: "s1", role: "Supervisor", email: "" } });
    expect("session" in (await requireSiteAccess(req()))).toBe(true);
  });
});
