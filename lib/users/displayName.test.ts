import { describe, expect, it } from "vitest";

import { displayName } from "./displayName";

describe("displayName", () => {
  it("prefers explicit fullName", () => {
    expect(displayName({ fullName: "Lalit Sharma", designation: "PM" }, "x@y.com")).toBe("Lalit Sharma");
  });

  it("derives a title-cased name from the email local-part", () => {
    expect(displayName({ fullName: null, designation: null }, "lalit.sharma@procurie.com")).toBe("Lalit Sharma");
    expect(displayName({ fullName: null, designation: null }, "john_doe@x.com")).toBe("John Doe");
    expect(displayName({ fullName: null, designation: null }, "mary-jane+tag@x.com")).toBe("Mary Jane");
  });

  it("falls back to designation when no name and no email", () => {
    expect(displayName({ fullName: null, designation: "Site Lead" }, null)).toBe("Site Lead");
  });

  it("falls back to the email when local-part is unusable", () => {
    expect(displayName({ fullName: null, designation: null }, "x@y.com")).toBe("X");
  });

  it("falls back to a short id when nothing else is available", () => {
    expect(displayName({ fullName: null, designation: null }, null, "abcdef12-0000")).toBe("abcdef12");
  });
});
