// The one TS home for "what did this labour row cost?".
// Precedence: mason+helper split → stored salaryAmount → peopleCount × wagePerHead.
//
// It lives here, outside lib/db/queries/, so callers that must not root their
// import graph in the Drizzle layer (entryFormat, the client entry-type
// descriptor) have a clean path to it. `calculateLabourTotal` in
// lib/db/queries/operationTotals.ts is now a re-export of this function, so the
// two can never drift.
//
// The three SQL copies (entries.ts labourSpendExpr, sites.ts siteTrackedSpend,
// search.ts) must stay in agreement with this; lib/db/queries/entries.test.ts
// holds the fixture-parity test that proves it.

export type LabourSpendInput = {
  peopleCount?: number | null;
  wagePerHead?: string | number | null;
  salaryAmount?: string | number | null;
  masonSalaryAmount?: string | number | null;
  helperSalaryAmount?: string | number | null;
};

function finiteNumber(value: string | number | null | undefined) {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

export function labourSpend(
  rowOrPeople: LabourSpendInput | number | null | undefined,
  wage?: string | number | null,
) {
  if (typeof rowOrPeople === "number" || rowOrPeople == null) {
    const people = Number(rowOrPeople ?? 0);
    const wageValue = finiteNumber(wage);
    return Number.isFinite(people) && Number.isFinite(wageValue) ? people * wageValue : 0;
  }

  const splitTotal =
    finiteNumber(rowOrPeople.masonSalaryAmount) +
    finiteNumber(rowOrPeople.helperSalaryAmount);
  if (splitTotal > 0) return splitTotal;

  const stored = finiteNumber(rowOrPeople.salaryAmount);
  if (stored > 0) return stored;

  const people = Number(rowOrPeople.peopleCount ?? 0);
  const wageValue = finiteNumber(rowOrPeople.wagePerHead);
  return Number.isFinite(people) && Number.isFinite(wageValue) ? people * wageValue : 0;
}
