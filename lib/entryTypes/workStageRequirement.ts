// Migration 0025_global_work_stage.sql added work_stage to labour/machinery/
// expense on this date. Entries created before it could not carry a stage, so
// forcing one at edit time would make supervisors invent a building phase from
// memory — fabricated data, or an abandoned correction. Either is worse than
// the gap.
export const WORK_STAGE_LAUNCH_DATE = "2026-07-25";

const LAUNCH_MS = Date.parse(`${WORK_STAGE_LAUNCH_DATE}T00:00:00Z`);

export type WorkStageRequirementInput = {
  isEdit: boolean;
  existingWorkStage?: string | null;
  entryCreatedAt?: string | Date | null;
};

export function isWorkStageRequired(input: WorkStageRequirementInput): boolean {
  // New entries always carry a stage. This is the rule that stops the gap growing.
  if (!input.isEdit) return true;

  // An entry that already has a stage can never be un-tagged.
  if (typeof input.existingWorkStage === "string" && input.existingWorkStage.trim()) return true;

  // Untagged on edit: exempt only if it predates the field. createdAt is NOT
  // NULL in the schema, so a missing or unparseable value means a wiring bug —
  // fail strict rather than open a silent bypass.
  const raw = input.entryCreatedAt;
  if (raw == null) return true;
  const ms = raw instanceof Date ? raw.getTime() : Date.parse(raw);
  if (!Number.isFinite(ms)) return true;

  return ms >= LAUNCH_MS;
}
