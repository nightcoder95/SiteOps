// lib/backup/env.test.ts
import { describe, expect, it } from "vitest";

import { requireEnv } from "./env";

describe("requireEnv", () => {
  it("returns the requested vars when all present", () => {
    const out = requireEnv(["A", "B"], { A: "1", B: "2", C: "3" });
    expect(out).toEqual({ A: "1", B: "2" });
  });

  it("throws naming every missing var, without leaking values", () => {
    expect(() => requireEnv(["A", "B", "C"], { A: "1", B: "  " })).toThrowError(
      /Missing required environment variables: B, C/,
    );
  });
});
