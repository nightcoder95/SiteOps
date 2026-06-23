import { describe, expect, it } from "vitest";

import { BACKUP_VERSION, toBackupJson, toCsv } from "./serialize";

describe("toBackupJson", () => {
  it("preserves a decimal string verbatim (never floats money)", () => {
    const json = toBackupJson({ t: [{ amount: "1234.56" }] }, ["t"]);
    expect(json).toContain('"amount":"1234.56"');
    expect(json).not.toContain("1234.5600");
    expect(json).not.toContain('"amount":1234.56'); // not a JSON number
  });

  it("preserves negative money exactly", () => {
    const json = toBackupJson({ t: [{ amount: "-500.50" }] }, ["t"]);
    expect(json).toContain('"amount":"-500.50"');
  });

  it("serializes a Date to ISO-8601 UTC", () => {
    const d = new Date("2026-06-22T10:30:00.000Z");
    const json = toBackupJson({ t: [{ at: d }] }, ["t"]);
    expect(json).toContain('"at":"2026-06-22T10:30:00.000Z"');
  });

  it("passes a YYYY-MM-DD date string through unchanged", () => {
    const json = toBackupJson({ t: [{ day: "2026-06-22" }] }, ["t"]);
    expect(json).toContain('"day":"2026-06-22"');
  });

  it("embeds a jsonb object unchanged", () => {
    const json = toBackupJson({ t: [{ meta: { a: 1, b: ["x"] } }] }, ["t"]);
    expect(JSON.parse(json).tables.t[0].meta).toEqual({ a: 1, b: ["x"] });
  });

  it("keeps null as null", () => {
    const json = toBackupJson({ t: [{ x: null }] }, ["t"]);
    expect(JSON.parse(json).tables.t[0].x).toBeNull();
  });

  it("produces { version, exportedAt, tables } with every key present (empty -> [])", () => {
    const at = new Date("2026-06-23T00:00:00.000Z");
    const parsed = JSON.parse(toBackupJson({ a: [{ id: 1 }] }, ["a", "b"], at));
    expect(parsed.version).toBe(BACKUP_VERSION);
    expect(parsed.exportedAt).toBe("2026-06-23T00:00:00.000Z");
    expect(parsed.tables.a).toEqual([{ id: 1 }]);
    expect(parsed.tables.b).toEqual([]); // missing key -> empty array
  });
});

describe("toCsv", () => {
  it("emits a header row equal to the column list", () => {
    expect(toCsv([], ["a", "b"])).toBe("a,b\r\n");
  });

  it("emits rows in column order; nulls -> empty string", () => {
    const csv = toCsv([{ a: "1", b: null }], ["a", "b"]);
    expect(csv).toBe("a,b\r\n1,\r\n");
  });

  it("RFC4180-quotes values with comma, quote, or newline (inner quotes doubled)", () => {
    expect(toCsv([{ a: "x,y" }], ["a"])).toBe('a\r\n"x,y"\r\n');
    expect(toCsv([{ a: 'he said "hi"' }], ["a"])).toBe('a\r\n"he said ""hi"""\r\n');
    expect(toCsv([{ a: "line1\nline2" }], ["a"])).toBe('a\r\n"line1\nline2"\r\n');
  });

  it("neutralizes formula-injection cells with a leading apostrophe", () => {
    expect(toCsv([{ a: "=cmd" }], ["a"])).toBe("a\r\n'=cmd\r\n");
    expect(toCsv([{ a: "@SUM(A1)" }], ["a"])).toBe("a\r\n'@SUM(A1)\r\n");
  });

  it("does NOT mangle negative money (numeric guard exempts valid numbers)", () => {
    expect(toCsv([{ a: "-500.50" }], ["a"])).toBe("a\r\n-500.50\r\n");
    expect(toCsv([{ a: "-42" }], ["a"])).toBe("a\r\n-42\r\n");
    expect(toCsv([{ a: "1234.56" }], ["a"])).toBe("a\r\n1234.56\r\n");
  });

  it("serializes a Date cell to ISO and a jsonb object to compact JSON", () => {
    const csv = toCsv([{ at: new Date("2026-06-22T10:30:00.000Z"), meta: { a: 1 } }], ["at", "meta"]);
    // meta contains a comma-free compact JSON object -> still quoted? no comma/quote/newline here
    expect(csv).toBe('at,meta\r\n2026-06-22T10:30:00.000Z,"{""a"":1}"\r\n');
  });
});
