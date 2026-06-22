import { describe, expect, it } from "vitest";

import { formatDate, formatDateTime } from "./formatDate";

describe("formatDate", () => {
  it("formats an ISO datetime as DD/MM/YYYY", () => {
    expect(formatDate("2026-06-21T10:30:00.000Z")).toBe("21/06/2026");
  });

  it("formats a date-only string without timezone shift", () => {
    // Date-only must be read as the calendar day, not UTC midnight (which can
    // roll back a day in negative timezones).
    expect(formatDate("2026-01-05")).toBe("05/01/2026");
  });

  it("zero-pads single-digit day and month", () => {
    expect(formatDate("2026-03-09")).toBe("09/03/2026");
  });

  it("accepts a Date instance", () => {
    expect(formatDate(new Date(2026, 5, 21))).toBe("21/06/2026");
  });

  it("returns empty string for null/undefined/empty", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("")).toBe("");
  });

  it("returns the original string when the value is unparseable", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatDateTime", () => {
  it("formats as DD/MM/YYYY, HH:MM in 24-hour zero-padded form", () => {
    const value = new Date(2026, 5, 21, 9, 5);
    expect(formatDateTime(value)).toBe("21/06/2026, 09:05");
  });

  it("returns empty string for empty input", () => {
    expect(formatDateTime("")).toBe("");
  });

  it("returns the original string when unparseable", () => {
    expect(formatDateTime("nope")).toBe("nope");
  });
});
