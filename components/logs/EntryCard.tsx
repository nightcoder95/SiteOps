"use client";

import Link from "next/link";

export type EntryCardData = {
  entryId: string;
  type: "labour" | "material" | "machinery" | "expense" | "incident" | "dynamic";
  primary: string;
  secondary?: string;
  date: string;
  amount?: string;
};

const ICONS: Record<EntryCardData["type"], string> = {
  labour: "engineering",
  material: "inventory_2",
  machinery: "precision_manufacturing",
  expense: "payments",
  incident: "report",
  dynamic: "category",
};

export function EntryCard({ entry }: { entry: EntryCardData }) {
  return (
    <Link
      href={`/app/logs/${entry.entryId}?type=${entry.type}`}
      className="surface-card flex items-center gap-3 p-3 active-press hover:bg-surface-container-low"
    >
      <span className="material-icon text-primary" aria-hidden="true">
        {ICONS[entry.type]}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-body-md font-medium text-on-surface truncate">{entry.primary}</div>
        {entry.secondary && (
          <div className="text-label-md text-on-surface-variant truncate">{entry.secondary}</div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        {entry.amount && (
          <div className="text-body-md font-semibold text-on-surface">{entry.amount}</div>
        )}
        <div className="text-label-md text-on-surface-variant">{entry.date}</div>
      </div>
    </Link>
  );
}
