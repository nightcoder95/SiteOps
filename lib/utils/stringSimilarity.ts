export type SimilarityCandidate = {
  id: string | number;
  name: string;
  score: number;
  band: "high" | "medium";
};

const STOP_WORDS = new Set(["the", "and", "of", "for", "to", "a", "an"]);

function singularizeToken(token: string) {
  if (token.length <= 3) return token;
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("sses")) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

export function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[_\-\/]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  const normalized = normalizeLabel(value);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((token) => singularizeToken(token))
    .filter((token) => token && !STOP_WORDS.has(token));
}

function jaccardScore(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = new Set([...setA, ...setB]).size;
  if (union === 0) return 0;
  return intersection / union;
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => []);
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

function editSimilarity(a: string, b: string) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

export function computeSimilarityScore(input: string, existing: string) {
  const normalizedInput = normalizeLabel(input);
  const normalizedExisting = normalizeLabel(existing);
  if (!normalizedInput || !normalizedExisting) return 0;
  if (normalizedInput === normalizedExisting) return 1;

  const inputTokens = tokenize(normalizedInput);
  const existingTokens = tokenize(normalizedExisting);
  const tokenScore = jaccardScore(inputTokens, existingTokens);
  const editScore = editSimilarity(normalizedInput, normalizedExisting);

  return Number((tokenScore * 0.45 + editScore * 0.55).toFixed(4));
}

export function rankSimilarityCandidates(
  input: string,
  options: Array<{ id: string | number; name: string }>,
  thresholds = { high: 0.85, medium: 0.7 },
) {
  const candidates = options
    .map((option) => {
      const score = computeSimilarityScore(input, option.name);
      if (score >= thresholds.high) {
        return { ...option, score, band: "high" as const };
      }
      if (score >= thresholds.medium) {
        return { ...option, score, band: "medium" as const };
      }
      return null;
    })
    .filter((item): item is SimilarityCandidate => item !== null)
    .sort((a, b) => b.score - a.score);

  const topScore = candidates[0]?.score ?? 0;
  const recommendedAction = topScore >= thresholds.medium ? "use_existing" : "create_new";
  return { candidates, topScore, recommendedAction };
}
