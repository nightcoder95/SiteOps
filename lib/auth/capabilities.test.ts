import { describe, expect, it } from "vitest";

import { ROLE_CAPABILITIES, can, type Capability } from "@/lib/auth/capabilities";
import { ALL_ROLES, ROLES } from "@/lib/auth/roles";

describe("capabilities map", () => {
  it("grants Admin the cross-owner override and user-management caps", () => {
    expect(can(ROLES.ADMIN, "resource:manage_all")).toBe(true);
    expect(can(ROLES.ADMIN, "user:create")).toBe(true);
    expect(can(ROLES.ADMIN, "user:list")).toBe(true);
    expect(can(ROLES.ADMIN, "user:manage_roles")).toBe(true);
  });

  it("denies Supervisor admin-only capabilities", () => {
    const adminOnly: Capability[] = [
      "resource:manage_all",
      "user:create",
      "user:list",
      "user:manage_roles",
      "site:create",
      "site:update",
      "site:delete",
      "site:read_all",
      "form_category:delete",
      "form_subcategory:delete",
      "field_request:read",
      "field_request:approve",
      "resource_request:approve",
      "transfer:approve",
      "analytics:read",
      "live_feed:read",
    ];
    for (const cap of adminOnly) {
      expect(can(ROLES.SUPERVISOR, cap)).toBe(false);
    }
  });

  it("grants Supervisor its own-scope + create capabilities", () => {
    const supervisorCaps: Capability[] = [
      "site:read",
      "entry:create",
      "entry:update",
      "entry:delete",
      "field_request:create",
      "field_request:delete",
      "resource_request:create",
      "transfer:create",
      "profile:update_self",
    ];
    for (const cap of supervisorCaps) {
      expect(can(ROLES.SUPERVISOR, cap)).toBe(true);
    }
  });

  it("Admin is a superset of Supervisor", () => {
    for (const cap of ROLE_CAPABILITIES[ROLES.SUPERVISOR]) {
      expect(can(ROLES.ADMIN, cap)).toBe(true);
    }
  });

  it("every role has a capability set", () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_CAPABILITIES[role]).toBeInstanceOf(Set);
    }
  });
});
