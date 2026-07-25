import { describe, expect, it } from "vitest";

import { mapEntryToFormValues } from "./mapEntryToFormValues";

const categoryId = "cat-1";

describe("mapEntryToFormValues — workStage prefill", () => {
  it("prefills workStage for labour when set", () => {
    const values = mapEntryToFormValues({ workStage: "Roof Level" }, "labour", categoryId);
    expect(values.workStage).toBe("Roof Level");
  });

  it("prefills workStage as empty string for labour when null", () => {
    const values = mapEntryToFormValues({ workStage: null }, "labour", categoryId);
    expect(values.workStage).toBe("");
  });

  it("prefills workStage for machinery when set", () => {
    const values = mapEntryToFormValues({ workStage: "Roof Level" }, "machinery", categoryId);
    expect(values.workStage).toBe("Roof Level");
  });

  it("prefills workStage for expense when set", () => {
    const values = mapEntryToFormValues({ workStage: "Roof Level" }, "expense", categoryId);
    expect(values.workStage).toBe("Roof Level");
  });
});
