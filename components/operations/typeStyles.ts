import type { EntryType } from "@/lib/db/queries/entries";

export function getTypeColor(type: EntryType) {
  switch (type) {
    case "labour":
      return "text-sky-400 bg-sky-500/10 border-sky-500/20";
    case "material":
      return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    case "machinery":
      return "text-slate-400 bg-slate-500/10 border-slate-500/20";
    case "expense":
      return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    case "incident":
      return "text-red-400 bg-red-500/10 border-red-500/20";
  }
}

// Solid, high-contrast fill (vs. getTypeColor's muted tint) for a selected/
// active state where the toggle must read unambiguously at a glance.
export function getTypeSolidColor(type: EntryType) {
  switch (type) {
    case "labour":
      return "bg-sky-500 border-sky-500 text-slate-950";
    case "material":
      return "bg-emerald-500 border-emerald-500 text-slate-950";
    case "machinery":
      return "bg-slate-400 border-slate-400 text-slate-950";
    case "expense":
      return "bg-amber-500 border-amber-500 text-slate-950";
    case "incident":
      return "bg-red-500 border-red-500 text-slate-950";
  }
}
