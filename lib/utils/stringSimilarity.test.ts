import { describe, expect, it } from "vitest";

import { computeSimilarityScore, normalizeLabel, rankSimilarityCandidates } from "@/lib/utils/stringSimilarity";

describe("stringSimilarity", () => {
  it("normalizes punctuation, separators and case", () => {
    expect(normalizeLabel("  Machineries / Tools  ")).toBe("machineries tools");
  });

  it("scores exact-equivalent labels highly", () => {
    const score = computeSimilarityScore("Labours", "labour");
    expect(score).toBeGreaterThanOrEqual(0.85);
  });

  it("ranks likely duplicates above medium threshold", () => {
    const ranked = rankSimilarityCandidates("Material Cost", [
      { id: "a", name: "Materials Costs" },
      { id: "b", name: "Equipment Hours" },
    ]);
    expect(ranked.candidates.length).toBe(1);
    expect(ranked.candidates[0].id).toBe("a");
    expect(ranked.recommendedAction).toBe("use_existing");
  });
});
