import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// F20. The header's back / search / bell buttons wrapped a 20px icon in p-2 →
// 8 + 20 + 8 = 36px. The iOS and Android guidance floor is 44px, and these are
// the controls a site supervisor taps with gloves on. Enlarged via padding
// (p-3 → 12 + 20 + 12 = 44px), not icon size: growing the glyph changes the
// header's visual weight and can reflow the flex row.
describe("header touch targets", () => {
  const source = readFileSync(
    path.resolve(__dirname, "..", "..", "components/app-shell/AppHeader.tsx"),
    "utf8",
  );

  test("no interactive header control is padded below 44px", () => {
    const tooSmall = source
      .split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => !line.trim().startsWith("//"))
      // p-2 around a w-5 icon is the 36px case; p-2.5 would be 40px.
      .filter(({ line }) => /className="[^"]*\bp-2(\.5)?\b/.test(line));

    expect(tooSmall.map((entry) => entry.number)).toEqual([]);
  });

  test("the unread dot still sits on the bell glyph after the padding change", () => {
    // The dot is positioned relative to the button, so more padding pushes it
    // inward off the glyph's corner unless it is re-anchored.
    const dot = source.split("\n").find((line) => line.includes("rounded-full border-2 border-slate-950"));
    expect(dot).toBeDefined();
    expect(dot).not.toMatch(/top-1\.5 right-1\.5/);
  });
});
