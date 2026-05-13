import { describe, expect, it, vi } from "vitest";

import { runNonCritical } from "@/lib/services/nonCritical";

vi.mock("@/lib/logging/log", () => ({
  logError: vi.fn(),
}));

import { logError } from "@/lib/logging/log";

describe("runNonCritical", () => {
  it("swallows failures and logs with event context", async () => {
    const promise = Promise.reject(new Error("boom"));
    runNonCritical("req_1", "side_effect_failure", promise, { key: "value" });
    await Promise.resolve();

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      "req_1",
      expect.any(Error),
      expect.objectContaining({ event: "side_effect_failure", key: "value" })
    );
  });
});
