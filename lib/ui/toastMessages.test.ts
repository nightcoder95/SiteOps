import { describe, expect, it } from "vitest";

import { ERROR_CODES } from "@/lib/errors/codes";
import { friendlyErrorMessage, GENERIC_ERROR_COPY } from "./toastMessages";

describe("friendlyErrorMessage", () => {
  it("maps known codes to friendly copy", () => {
    expect(friendlyErrorMessage(ERROR_CODES.FORBIDDEN)).toMatch(/permission/i);
    expect(friendlyErrorMessage(ERROR_CODES.RATE_LIMITED)).toMatch(/too many/i);
  });

  it("falls back to the generic message for unknown/absent codes", () => {
    expect(friendlyErrorMessage(undefined)).toBe(GENERIC_ERROR_COPY);
    expect(friendlyErrorMessage("SOME_INTERNAL_CODE")).toBe(GENERIC_ERROR_COPY);
  });

  it("never returns a raw backend string", () => {
    // A DB constraint message must not pass through.
    expect(friendlyErrorMessage('duplicate key value violates unique constraint')).toBe(
      GENERIC_ERROR_COPY,
    );
  });
});
