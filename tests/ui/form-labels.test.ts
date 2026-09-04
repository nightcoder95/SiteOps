import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// F20. A <label> with no htmlFor is not a label — clicking it does not focus
// the control, and a screen reader announces the input as unlabelled. The
// correct pattern already exists in EntryForm's FieldRow. These two files were
// the remaining offenders after Phase 1 fixed the split-labour inputs.
const FILES = [
  "components/logs/CategoryPicker.tsx",
  "components/transfers/TransferForm.tsx",
];

const repoRoot = path.resolve(__dirname, "..", "..");

describe("form label association", () => {
  test.each(FILES)("%s: every <label> points at a control", (file) => {
    const source = readFileSync(path.join(repoRoot, file), "utf8");
    // Strip JSX and line comments first — several of them legitimately mention
    // <label> while explaining why a given control is labelled another way.
    const code = source
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    const unassociated = (code.match(/<label\b[^>]*>/g) ?? []).filter(
      (tag) => !/htmlFor=/.test(tag),
    );

    expect(unassociated).toEqual([]);
  });

  test.each(FILES)("%s: every control is addressable by id or aria-label", (file) => {
    const source = readFileSync(path.join(repoRoot, file), "utf8");
    // Opening tags of real form controls. A control needs either an id (for a
    // <label htmlFor>) or an aria-label (for compact rows that have no visible
    // label to associate). JSX tags here span several lines, so match the whole
    // opening tag rather than the line the tag name happens to sit on.
    const openingTags = source.match(/<(input|select|textarea)\b[^>]*>/g) ?? [];
    const unlabelled = openingTags.filter((tag) => !/\bid=|aria-label/.test(tag));

    expect(unlabelled).toEqual([]);
  });
});
