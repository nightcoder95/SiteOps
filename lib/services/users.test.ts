import { describe, expect, it } from "vitest";

import { resolveRoleChange } from "./users";

describe("resolveRoleChange", () => {
  it("reports not_found for an unknown target", () => {
    expect(resolveRoleChange({ adminCount: 2, currentRole: null, newRole: "Admin" })).toEqual({
      type: "not_found",
    });
  });

  it("no-ops when the role is unchanged", () => {
    expect(
      resolveRoleChange({ adminCount: 1, currentRole: "Admin", newRole: "Admin" }),
    ).toEqual({ type: "noop", role: "Admin" });
  });

  it("blocks demoting the only remaining admin", () => {
    expect(
      resolveRoleChange({ adminCount: 1, currentRole: "Admin", newRole: "Supervisor" }),
    ).toEqual({ type: "last_admin" });
  });

  it("allows demotion when another admin exists and flags it demoted", () => {
    expect(
      resolveRoleChange({ adminCount: 2, currentRole: "Admin", newRole: "Supervisor" }),
    ).toEqual({ type: "ok", previousRole: "Admin", demoted: true });
  });

  it("allows promotion and does not flag it demoted", () => {
    expect(
      resolveRoleChange({ adminCount: 1, currentRole: "Supervisor", newRole: "Admin" }),
    ).toEqual({ type: "ok", previousRole: "Supervisor", demoted: false });
  });
});
