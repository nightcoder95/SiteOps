import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// Native window.confirm / window.prompt are unstyled, ignore safe-area insets,
// and are silently suppressed by some engines inside installed PWAs — a
// destructive action then never confirms. The app has branded replacements
// (lib/ui/confirm.tsx, components/catalog/RenameModal.tsx); this test is the
// fence that stops the native versions creeping back in.
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
      if (!/\.(ts|tsx)$/.test(name)) continue;
      out.push(abs);
    }
  }
  return out;
}

describe("native dialogs", () => {
  test("no window.confirm or window.prompt in app code", () => {
    const repoRoot = path.resolve(__dirname, "..", "..");
    const files = ["app", "components", "lib"].flatMap((part) => {
      try { return walkFiles(path.join(repoRoot, part)); } catch { return []; }
    });

    const offenders = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      // Ignore comment lines — RenameModal's header legitimately mentions the API.
      return source
        .split("\n")
        .some((line) => !line.trim().startsWith("//") && /window\.(confirm|prompt)\s*\(/.test(line));
    });

    expect(offenders.map((f) => path.relative(repoRoot, f))).toEqual([]);
  });
});
