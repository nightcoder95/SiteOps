import { describe, expect, it } from "vitest";

import { applyCsvView, formatUser, type UserDirectory } from "./csvView";

const dir: UserDirectory = new Map([
  ["u-admin", { role: "Admin", label: "Bharath Anand" }],
  ["u-super", { role: "Supervisor", label: "Satheesh" }],
]);

describe("applyCsvView", () => {
  it("drops noise columns (icon, purpose, editable)", () => {
    const { columns } = applyCsvView(
      [{ id: 1, name: "Materials", icon: null, purpose: "operation", editable: true }],
      ["id", "name", "icon", "purpose", "editable"],
    );
    expect(columns).toEqual(["id", "name"]);
  });

  it("drops columns empty across every row, keeps partially-filled ones", () => {
    const { columns } = applyCsvView(
      [
        { id: 1, note: "x", region: null },
        { id: 2, note: "", region: null },
        { id: 3, note: "y", region: null },
      ],
      ["id", "note", "region"],
    );
    expect(columns).toEqual(["id", "note"]); // region all-null -> dropped, note kept
  });

  it("keeps the full header for an empty table (still self-describing)", () => {
    const { rows, columns } = applyCsvView([], ["id", "name", "region"]);
    expect(rows).toEqual([]);
    expect(columns).toEqual(["id", "name", "region"]); // nothing dropped except noise
  });

  it("resolves user-id columns to 'Name (Role)'", () => {
    const { rows } = applyCsvView(
      [{ id: 1, createdBy: "u-admin", supervisorId: "u-super" }],
      ["id", "createdBy", "supervisorId"],
      dir,
    );
    expect(rows[0].createdBy).toBe("Bharath Anand (Admin)");
    expect(rows[0].supervisorId).toBe("Satheesh (Supervisor)");
  });

  it("leaves an unknown user id and null untouched (column kept because not all-empty)", () => {
    const { rows } = applyCsvView(
      [
        { id: 1, createdBy: "ghost" },
        { id: 2, createdBy: null },
      ],
      ["id", "createdBy"],
      dir,
    );
    expect(rows[0].createdBy).toBe("ghost"); // unknown id passes through
    expect(rows[1].createdBy).toBeNull(); // null passes through
  });

  it("preserves column order and passes non-user, non-noise columns through", () => {
    const { rows, columns } = applyCsvView(
      [{ id: 1, name: "Site A", budget: "5000000.00", createdBy: "u-admin", createdAt: "2026-06-10" }],
      ["id", "name", "budget", "createdBy", "createdAt"],
      dir,
    );
    expect(columns).toEqual(["id", "name", "budget", "createdBy", "createdAt"]);
    expect(rows[0].budget).toBe("5000000.00"); // money string untouched
    expect(rows[0].createdAt).toBe("2026-06-10");
  });
});

describe("formatUser", () => {
  it("formats known users and passes through everything else", () => {
    expect(formatUser("u-admin", dir)).toBe("Bharath Anand (Admin)");
    expect(formatUser("nope", dir)).toBe("nope");
    expect(formatUser(null, dir)).toBeNull();
    expect(formatUser(42, dir)).toBe(42);
  });
});
