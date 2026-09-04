import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// F20. The app shipped a Material Symbols webfont from Google Fonts purely for
// ~22 glyphs, alongside lucide-react which was already a dependency. lucide
// imports are named, so only the icons actually used ship — and the webfont
// request, its preconnects and its render-blocking stylesheet all go away.
//
// A partial migration is pure churn (the font still loads), so this fence is
// all-or-nothing: no glyph class, no font link, no leftover CSS rule.
function walkFiles(root: string, exts: RegExp): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) continue;
    for (const name of readdirSync(next)) {
      if (name === ".next" || name === "node_modules" || name === ".git") continue;
      const abs = path.join(next, name);
      if (statSync(abs).isDirectory()) { stack.push(abs); continue; }
      if (!exts.test(name)) continue;
      out.push(abs);
    }
  }
  return out;
}

const repoRoot = path.resolve(__dirname, "..", "..");

describe("icon font removal", () => {
  test("no source file references the Material Symbols font", () => {
    const files = ["app", "components", "lib"].flatMap((part) => {
      try { return walkFiles(path.join(repoRoot, part), /\.(tsx?|css)$/); } catch { return []; }
    });

    const offenders = files.filter((file) =>
      /material-symbols|material-icon|Material\+Symbols|Material Symbols/.test(readFileSync(file, "utf8")),
    );

    expect(offenders.map((file) => path.relative(repoRoot, file))).toEqual([]);
  });

  test("the layout no longer loads a runtime Google Fonts stylesheet", () => {
    // Inter comes through next/font/google, which self-hosts at build time —
    // so once Material Symbols is gone there is nothing left to preconnect to.
    const layout = readFileSync(path.join(repoRoot, "app/layout.tsx"), "utf8");
    expect(layout).not.toMatch(/fonts\.googleapis\.com/);
    expect(layout).not.toMatch(/fonts\.gstatic\.com/);
  });

  test("no raw warning emoji is used as an icon", () => {
    // Emoji render differently on every platform and are announced oddly by
    // screen readers.
    const picker = readFileSync(path.join(repoRoot, "components/logs/CategoryPicker.tsx"), "utf8");
    expect(picker).not.toContain("⚠");
  });
});
