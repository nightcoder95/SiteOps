// Split text into matched / unmatched parts for safe keyword highlighting.
// Pure data — the renderer wraps `match: true` parts in <mark>. Never produces
// HTML, so it cannot be an XSS vector.

export interface HighlightPart {
  text: string;
  match: boolean;
}

/**
 * Split `text` around every case-insensitive occurrence of `query`.
 * Empty/whitespace query → the whole text as a single non-match part.
 */
export function splitHighlight(text: string, query: string): HighlightPart[] {
  const q = query.trim();
  if (!text) return [];
  if (!q) return [{ text, match: false }];

  const parts: HighlightPart[] = [];
  const lcText = text.toLowerCase();
  const lcQuery = q.toLowerCase();
  let i = 0;

  while (i < text.length) {
    const found = lcText.indexOf(lcQuery, i);
    if (found === -1) {
      parts.push({ text: text.slice(i), match: false });
      break;
    }
    if (found > i) parts.push({ text: text.slice(i, found), match: false });
    parts.push({ text: text.slice(found, found + lcQuery.length), match: true });
    i = found + lcQuery.length;
  }

  return parts;
}
