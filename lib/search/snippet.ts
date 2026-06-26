// Build a short, match-centered snippet of a free-text note for search results.
// Code-point safe (Array.from) so emoji/surrogate pairs never split mid-character.

const ELLIPSIS = "…";

/** Index of the first occurrence of `needle` (sequence) in `haystack`, or -1. */
function indexOfSeq(haystack: string[], needle: string[]): number {
  if (needle.length === 0) return -1;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    let hit = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return i;
  }
  return -1;
}

/**
 * Trim `text` to at most `maxLen` code points, centered on the first
 * case-insensitive match of `query`. Adds leading/trailing ellipses when the
 * window does not reach the original boundary. Returns the full text unchanged
 * when it already fits.
 */
export function makeSnippet(text: string, query: string, maxLen = 140): string {
  if (!text) return "";
  const chars = Array.from(text);
  if (chars.length <= maxLen) return text;

  const lcChars = Array.from(text.toLowerCase());
  const qChars = Array.from(query.toLowerCase().trim());
  const matchAt = indexOfSeq(lcChars, qChars);

  if (matchAt < 0) {
    // No literal match (e.g. fuzzy/trigram hit) — show the head.
    return chars.slice(0, maxLen - 1).join("") + ELLIPSIS;
  }

  const half = Math.floor((maxLen - qChars.length) / 2);
  let start = Math.max(0, matchAt - half);
  let end = Math.min(chars.length, start + maxLen);
  start = Math.max(0, end - maxLen); // re-pin start when clamped at the end

  const prefix = start > 0 ? ELLIPSIS : "";
  const suffix = end < chars.length ? ELLIPSIS : "";
  return prefix + chars.slice(start, end).join("") + suffix;
}
