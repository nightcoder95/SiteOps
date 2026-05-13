import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseJsonBody, validateBody } from "@/lib/http/request";

describe("request helpers", () => {
  it("parseJsonBody returns failure response for invalid payload", async () => {
    const req = new NextRequest("http://localhost/api/x", {
      method: "POST",
      body: "{invalid",
      headers: { "content-type": "application/json" },
    });

    const parsed = await parseJsonBody(req, "req_test");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.response.status).toBe(400);
    }
  });

  it("validateBody returns parsed data for valid schema", () => {
    const schema = z.object({ value: z.string().min(1) });
    const validation = validateBody(schema, { value: "ok" }, "req_test");
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.data.value).toBe("ok");
    }
  });
});
