import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// F20. The catalog similarity check is a POST behind withApi (and therefore the
// rate limiter). Calling it straight from onChange fires one request per
// keystroke — typing "Brickwork" cost nine. It is advisory copy that never
// blocks submit, so checking the settled value is free.
//
// Both entry points are fenced. CatalogAddModal is the shared one: its prop is
// documented as "Debounced live similarity check", but it was not debounced,
// so UnitsManager and SubcategoryCombobox inherited the per-keystroke calls.
const SIMILARITY_CALLERS = [
  "components/logs/CategoryPicker.tsx",
  "components/catalog/CatalogAddModal.tsx",
];

describe("catalog similarity check", () => {
  const repoRoot = path.resolve(__dirname, "..", "..");

  test.each(SIMILARITY_CALLERS)("%s debounces rather than firing per keystroke", (file) => {
    const source = readFileSync(path.join(repoRoot, file), "utf8");

    expect(source).toContain("useDebouncedValue");

    // No similarity call may sit on a change-handler line.
    const perKeystroke = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .filter((line) => /onChange|handleNameChange\s*\(/.test(line) && /[cC]heckSimilarity/.test(line));

    expect(perKeystroke).toEqual([]);
  });

  test("clearing the field still clears the hint instead of stranding it", () => {
    // The debounced effect must handle the empty value explicitly: an early
    // `return` on empty input would leave the previous name's hint on screen.
    const source = readFileSync(
      path.join(repoRoot, "components/logs/CategoryPicker.tsx"),
      "utf8",
    );
    expect(source).toContain("setSimilarity(null)");
  });
});
