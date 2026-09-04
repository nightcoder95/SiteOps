import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// F20. The app header is fixed at z-50. Any floating overlay below that renders
// *behind* it when opened near the top of a scrolled page — which is exactly
// what the export panel's dropdown and the catalog row-actions menu did at
// z-30. The layering tokens in app/globals.css document the scale; this fence
// stops a sub-header z-index reaching a floating element again.
function walkFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) continue;
    for (const name of readdirSync(next)) {
      if (name === ".next" || name === "node_modules" || name === ".git") continue;
      const abs = path.join(next, name);
      if (statSync(abs).isDirectory()) { stack.push(abs); continue; }
      if (!/\.tsx?$/.test(name)) continue;
      out.push(abs);
    }
  }
  return out;
}

describe("layering", () => {
  test("no floating overlay sits below the fixed header", () => {
    const repoRoot = path.resolve(__dirname, "..", "..");
    const files = ["app", "components", "lib"].flatMap((part) => {
      try { return walkFiles(path.join(repoRoot, part)); } catch { return []; }
    });

    // Decorative elements that are positioned but layer only against their own
    // siblings inside a card. They must NOT be raised — a badge at z-[60] would
    // float over the header, which is the same bug in the other direction.
    const DECORATIVE_ALLOWLIST = [
      "components/transfers/TransferForm.tsx", // the swap-arrow badge between the two site fields
    ];

    // An element that is `absolute` or `fixed` AND carries a z-index under the
    // z-50 header.
    const offenders: string[] = [];
    for (const file of files) {
      const relative = path.relative(repoRoot, file);
      if (DECORATIVE_ALLOWLIST.includes(relative)) continue;
      const source = readFileSync(file, "utf8");
      for (const [index, line] of source.split("\n").entries()) {
        if (line.trim().startsWith("//")) continue;
        if (!/\b(absolute|fixed)\b/.test(line)) continue;
        const match = line.match(/\bz-(\d{1,2})\b/);
        if (match && Number(match[1]) < 50) {
          offenders.push(`${relative}:${index + 1} (z-${match[1]})`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
