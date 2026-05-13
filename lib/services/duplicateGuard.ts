import { normalizeLabel, rankSimilarityCandidates } from "@/lib/utils/stringSimilarity";

export function checkDuplicateOrSimilar(
  input: string,
  existingOptions: Array<{ id: string | number; name: string }>,
  mediumThreshold = 0.7,
) {
  const normalizedInput = normalizeLabel(input);
  const exact = existingOptions.find((o) => normalizeLabel(o.name) === normalizedInput);
  if (exact) {
    return {
      blocked: true,
      reason: "exact_duplicate",
      candidates: [{ id: exact.id, name: exact.name, score: 1, band: "high" as const }],
    };
  }

  const ranked = rankSimilarityCandidates(input, existingOptions, {
    high: Math.max(mediumThreshold + 0.15, 0.85),
    medium: mediumThreshold,
  });

  if (ranked.topScore >= mediumThreshold) {
    return {
      blocked: true,
      reason: "similar_duplicate",
      candidates: ranked.candidates,
    };
  }

  return {
    blocked: false,
    reason: null,
    candidates: [] as Array<{ id: string | number; name: string; score: number; band: "high" | "medium" }>,
  };
}
