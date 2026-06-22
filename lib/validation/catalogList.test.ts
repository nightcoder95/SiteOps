import { describe, expect, it, vi } from "vitest";

import { assertInCatalogList, isCatalogMember } from "./catalogList";

describe("isCatalogMember", () => {
  const names = ["Basement Level", "Roof Level", "Other"];

  it("accepts an exact active value", () => {
    expect(isCatalogMember(names, "Roof Level")).toBe(true);
  });

  it("accepts despite surrounding whitespace / case drift", () => {
    expect(isCatalogMember(names, "  roof level ")).toBe(true);
  });

  it("rejects an unknown value", () => {
    expect(isCatalogMember(names, "Sky Level")).toBe(false);
  });

  it("rejects empty / whitespace-only", () => {
    expect(isCatalogMember(names, "")).toBe(false);
    expect(isCatalogMember(names, "   ")).toBe(false);
  });

  it("rejects when the list is empty", () => {
    expect(isCatalogMember([], "Roof Level")).toBe(false);
  });
});

describe("assertInCatalogList", () => {
  it("resolves ok with the canonical value when present", async () => {
    const loader = vi.fn().mockResolvedValue(["Safety", "Block"]);
    const res = await assertInCatalogList("Incident Type", "safety", loader);
    expect(res).toEqual({ ok: true, value: "Safety" });
    expect(loader).toHaveBeenCalledWith("Incident Type");
  });

  it("resolves not-ok for an unknown value", async () => {
    const loader = vi.fn().mockResolvedValue(["Low", "Medium", "High"]);
    const res = await assertInCatalogList("Incident Severity", "Nuclear", loader);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/Incident Severity/);
  });

  it("resolves not-ok for empty value without hitting the loader twice", async () => {
    const loader = vi.fn().mockResolvedValue(["Low"]);
    const res = await assertInCatalogList("Incident Severity", "", loader);
    expect(res.ok).toBe(false);
  });
});
