import { describe, expect, it } from "vitest";
import { translateToPayload } from "./translate";

const uuid = () => crypto.randomUUID();

describe("translateToPayload", () => {
  const baseTool = {
    toolId: "t-1",
    version: 3,
    totalQuantity: 10,
    assignments: [
      { siteId: "s-1", qty: 3 },
      { siteId: "s-2", qty: 2 },
    ],
  };

  it("translates send_to_site for new site", () => {
    const site3 = uuid();
    const payload = translateToPayload(baseTool, {
      kind: "send_to_site",
      targetSiteId: site3,
      quantity: 4,
      note: "Sent to site 3",
    });
    expect(payload).toEqual({
      toolId: "t-1",
      version: 3,
      note: "Sent to site 3",
      assignments: [
        { siteId: "s-1", qty: 3 },
        { siteId: "s-2", qty: 2 },
        { siteId: site3, qty: 4 },
      ],
    });
  });

  it("translates send_to_site for existing assigned site", () => {
    const payload = translateToPayload(baseTool, {
      kind: "send_to_site",
      targetSiteId: "s-1",
      quantity: 2,
    });
    expect(payload.assignments).toEqual([
      { siteId: "s-1", qty: 5 },
      { siteId: "s-2", qty: 2 },
    ]);
  });

  it("translates return_to_godown partial return", () => {
    const payload = translateToPayload(baseTool, {
      kind: "return_to_godown",
      fromSiteId: "s-1",
      quantity: 1,
    });
    expect(payload.assignments).toEqual([
      { siteId: "s-1", qty: 2 },
      { siteId: "s-2", qty: 2 },
    ]);
  });

  it("translates return_to_godown full return (removes assignment)", () => {
    const payload = translateToPayload(baseTool, {
      kind: "return_to_godown",
      fromSiteId: "s-1",
      quantity: 3,
    });
    expect(payload.assignments).toEqual([{ siteId: "s-2", qty: 2 }]);
  });

  it("translates transfer_site atomically between existing sites", () => {
    const payload = translateToPayload(baseTool, {
      kind: "transfer_site",
      fromSiteId: "s-1",
      targetSiteId: "s-2",
      quantity: 2,
    });
    expect(payload.assignments).toEqual([
      { siteId: "s-1", qty: 1 },
      { siteId: "s-2", qty: 4 },
    ]);
  });

  it("translates transfer_site to a new destination site", () => {
    const site3 = uuid();
    const payload = translateToPayload(baseTool, {
      kind: "transfer_site",
      fromSiteId: "s-1",
      targetSiteId: site3,
      quantity: 3,
    });
    expect(payload.assignments).toEqual([
      { siteId: "s-2", qty: 2 },
      { siteId: site3, qty: 3 },
    ]);
  });

  it("translates add_stock", () => {
    const payload = translateToPayload(baseTool, {
      kind: "add_stock",
      quantity: 5,
    });
    expect(payload).toEqual({
      toolId: "t-1",
      version: 3,
      totalQuantity: 15,
      note: undefined,
    });
  });

  it("translates remove_stock", () => {
    const payload = translateToPayload(baseTool, {
      kind: "remove_stock",
      quantity: 2,
    });
    expect(payload).toEqual({
      toolId: "t-1",
      version: 3,
      totalQuantity: 8,
      note: undefined,
    });
  });
});
