import { describe, expect, it } from "vitest";

import { isWorkStageRequired } from "./workStageRequirement";

describe("isWorkStageRequired", () => {
  it("requires a stage on create", () => {
    expect(isWorkStageRequired({ isEdit: false })).toBe(true);
  });

  it("requires a stage on create even if a stale createdAt is passed", () => {
    // Create has no entry yet; createdAt must be ignored, not used to exempt.
    expect(
      isWorkStageRequired({ isEdit: false, entryCreatedAt: "2026-01-01T00:00:00Z" }),
    ).toBe(true);
  });

  it("exempts an untagged entry created before the field existed", () => {
    expect(
      isWorkStageRequired({
        isEdit: true,
        existingWorkStage: null,
        entryCreatedAt: "2026-07-24T23:59:59Z",
      }),
    ).toBe(false);
  });

  it("requires a stage for an untagged entry created after the field existed", () => {
    expect(
      isWorkStageRequired({
        isEdit: true,
        existingWorkStage: null,
        entryCreatedAt: "2026-07-25T00:00:00Z",
      }),
    ).toBe(true);
  });

  it("requires a stage for an already-tagged legacy entry, so it cannot be un-tagged", () => {
    expect(
      isWorkStageRequired({
        isEdit: true,
        existingWorkStage: "Basement Level",
        entryCreatedAt: "2026-01-01T00:00:00Z",
      }),
    ).toBe(true);
  });

  it("treats an empty-string stage as untagged", () => {
    expect(
      isWorkStageRequired({
        isEdit: true,
        existingWorkStage: "   ",
        entryCreatedAt: "2026-01-01T00:00:00Z",
      }),
    ).toBe(false);
  });

  it("requires a stage when createdAt is missing or unparseable", () => {
    // Fail strict: createdAt is NOT NULL in the schema, so absence means a
    // caller wiring bug. Silently exempting would open the hole this closes.
    expect(isWorkStageRequired({ isEdit: true, existingWorkStage: null })).toBe(true);
    expect(
      isWorkStageRequired({ isEdit: true, existingWorkStage: null, entryCreatedAt: "not-a-date" }),
    ).toBe(true);
  });

  it("accepts a Date as well as an ISO string", () => {
    expect(
      isWorkStageRequired({
        isEdit: true,
        existingWorkStage: null,
        entryCreatedAt: new Date("2026-07-24T00:00:00Z"),
      }),
    ).toBe(false);
  });
});
