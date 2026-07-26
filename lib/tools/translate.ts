import type { ToolMovementBody } from "@/lib/validation/toolSchemas";
import type { AssignmentInput } from "./types";
import type { ToolPayload } from "./applyBatch";

export type BaseToolState = {
  toolId: string;
  version: number;
  totalQuantity: number;
  assignments: AssignmentInput[];
};

// Pure translator function: maps a UI movement action (send_to_site, return_to_godown,
// transfer_site, add_stock, remove_stock) to an end-state ToolPayload for applyOneTool.
export function translateToPayload(
  tool: BaseToolState,
  body: ToolMovementBody,
): ToolPayload {
  const base = { toolId: tool.toolId, version: tool.version, note: body.note };

  switch (body.kind) {
    case "send_to_site": {
      const assignments = tool.assignments.map((a) => ({ ...a }));
      const existing = assignments.find((a) => a.siteId === body.targetSiteId);
      if (existing) {
        existing.qty += body.quantity;
      } else {
        assignments.push({ siteId: body.targetSiteId, qty: body.quantity });
      }
      return { ...base, assignments };
    }
    case "return_to_godown": {
      const assignments = tool.assignments
        .map((a) => (a.siteId === body.fromSiteId ? { ...a, qty: a.qty - body.quantity } : { ...a }))
        .filter((a) => a.qty > 0);
      return { ...base, assignments };
    }
    case "transfer_site": {
      let foundTarget = false;
      const assignments = tool.assignments
        .map((a) => {
          if (a.siteId === body.fromSiteId) {
            return { ...a, qty: a.qty - body.quantity };
          }
          if (a.siteId === body.targetSiteId) {
            foundTarget = true;
            return { ...a, qty: a.qty + body.quantity };
          }
          return { ...a };
        })
        .filter((a) => a.qty > 0);

      if (!foundTarget) {
        assignments.push({ siteId: body.targetSiteId, qty: body.quantity });
      }
      return { ...base, assignments };
    }
    case "add_stock":
      return { ...base, totalQuantity: tool.totalQuantity + body.quantity };
    case "remove_stock":
      return { ...base, totalQuantity: tool.totalQuantity - body.quantity };
  }
}
