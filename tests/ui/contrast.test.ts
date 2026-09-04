import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// F17. Several inputs in this app use their placeholder as the ONLY label, so a
// low-contrast placeholder is not decorative text — it is the field's name.
// Field supervisors read this on phones outdoors.
//
// Measured against the app surface #020617 (WCAG 2.1 relative luminance):
//   slate-600 #475569 → 2.66:1   fails AA (4.5:1)
//   slate-500 #64748b → 4.24:1   fails AA — close, but still under
//   slate-400 #94a3b8 → 7.87:1   passes
//   slate-300 #cbd5e1 → 13.59:1  passes
//
// Both Tailwind spellings are fenced: the `placeholder-*` shorthand and the
// `placeholder:text-*` variant (the global search overlay used the latter,
// which a grep for the shorthand alone silently misses).
const LOW_CONTRAST_PLACEHOLDER = /placeholder-slate-(500|600|700|800|900)\b|placeholder:text-slate-(500|600|700|800|900)\b/;

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
      if (!/\.(ts|tsx|css)$/.test(name)) continue;
      out.push(abs);
    }
  }
  return out;
}

describe("placeholder contrast", () => {
  test("no placeholder utility falls below WCAG AA on the app surface", () => {
    const repoRoot = path.resolve(__dirname, "..", "..");
    const files = ["app", "components"].flatMap((part) => {
      try { return walkFiles(path.join(repoRoot, part)); } catch { return []; }
    });

    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source
        .split("\n")
        .some((line) => !line.trim().startsWith("//") && LOW_CONTRAST_PLACEHOLDER.test(line));
    });

    expect(offenders.map((file) => path.relative(repoRoot, file))).toEqual([]);
  });
});

// F17, second half. 98 call sites use text-[9px]/text-[10px]; most are
// decorative micro-labels that duplicate adjacent content, and bumping all of
// them would be a redesign rather than a fix. These are the ones a user must
// actually read — each labels a number, names a row's type, or is the only text
// on an otherwise blank screen. The fence is keyed by the element's content so
// it survives the lines moving.
const MICRO_TEXT = /text-\[(9|10)px\]/;

const USER_CRITICAL: ReadonlyArray<readonly [string, string]> = [
  // [file, a string that identifies the element's line]
  ["components/operations/EntryLogList.tsx", "Running total"],
  ["components/operations/EntryLogList.tsx", "Day total"],
  ["components/operations/EntryLogList.tsx", "italic"],           // empty-state copy
  ["app/app/sites/[id]/operations/[type]/AllOperationsPageClient.tsx", "Logs</p>"],
  ["app/app/sites/[id]/operations/[type]/AllOperationsPageClient.tsx", "Day total"],
  ["app/app/sites/[id]/operations/[type]/AllOperationsPageClient.tsx", "italic"],
  ["app/app/sites/[id]/operations/[type]/AllOperationsPageClient.tsx", "getTypeColor(row.type)"], // row type chip
];

describe("type floor for user-critical text", () => {
  const repoRoot = path.resolve(__dirname, "..", "..");

  test.each(USER_CRITICAL)("%s: the line containing %j is at least 12px", (file, needle) => {
    const lines = readFileSync(path.join(repoRoot, file), "utf8").split("\n");
    const matching = lines.filter((line) => line.includes(needle));

    expect(matching.length).toBeGreaterThan(0); // the needle must still exist
    for (const line of matching) expect(line).not.toMatch(MICRO_TEXT);
  });

  test("work-stage chips are content, not decoration, so they clear the floor", () => {
    // renderEntrySummary draws the work-stage chip for four of the five types;
    // it is the entry's stage, not a repeat of anything next to it.
    const lines = readFileSync(
      path.join(repoRoot, "components/operations/entryFormat.tsx"),
      "utf8",
    ).split("\n");
    const chips = lines.filter((line) => line.includes("border-emerald-500/20"));

    expect(chips).toHaveLength(4);
    for (const chip of chips) expect(chip).not.toMatch(MICRO_TEXT);
  });
});
