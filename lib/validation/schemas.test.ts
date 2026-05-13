import { describe, expect, it } from "vitest";

import {
  incidentEntrySchema,
  updateIncidentEntrySchema,
} from "@/lib/validation/schemas";

describe("incident schemas", () => {
  it("accepts valid incident create payload", () => {
    const result = incidentEntrySchema.safeParse({
      siteId: "550e8400-e29b-41d4-a716-446655440000",
      incidentType: "Safety",
      severity: "High",
      description: "Scaffolding issue",
      durationEstimate: 120,
    });

    expect(result.success).toBe(true);
  });

  it("allows patch payload without siteId", () => {
    const result = updateIncidentEntrySchema.safeParse({
      description: "Updated detail",
      severity: "Low",
    });

    expect(result.success).toBe(true);
  });

  it("rejects negative duration", () => {
    const result = updateIncidentEntrySchema.safeParse({
      durationEstimate: -1,
    });

    expect(result.success).toBe(false);
  });
});
