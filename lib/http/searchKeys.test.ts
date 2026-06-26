import { describe, expect, it } from "vitest";

import { RESULTS_LIMIT, SUGGESTION_LIMIT, searchKey } from "@/lib/http/searchKeys";

describe("searchKey", () => {
  it("returns null below the minimum length", () => {
    expect(searchKey("a", SUGGESTION_LIMIT)).toBeNull();
    expect(searchKey("   ", SUGGESTION_LIMIT)).toBeNull();
  });

  it("builds a suggestion-mode URL", () => {
    expect(searchKey("permit", SUGGESTION_LIMIT)).toBe(
      "/api/search/remarks?q=permit&limit=7&offset=0",
    );
  });

  it("builds a results-mode URL with offset", () => {
    expect(searchKey("permit", RESULTS_LIMIT, 50)).toBe(
      "/api/search/remarks?q=permit&limit=50&offset=50",
    );
  });

  it("trims and url-encodes the query", () => {
    expect(searchKey("  a b ", SUGGESTION_LIMIT)).toBe(
      "/api/search/remarks?q=a+b&limit=7&offset=0",
    );
  });
});
