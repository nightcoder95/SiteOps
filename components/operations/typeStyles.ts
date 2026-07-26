import type { EntryType } from "@/lib/db/queries/entries";

export function getTypeColor(type: EntryType) {
  switch (type) {
    case "labour":
      return "text-sky-400 bg-sky-500/10 border-sky-500/20";
    case "material":
      return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    case "machinery":
      return "text-violet-400 bg-violet-500/10 border-violet-500/20";
    case "expense":
      return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    case "incident":
      return "text-rose-400 bg-rose-500/10 border-rose-500/20";
  }
}

// Glowing glass active state styling for high-contrast, instant visual feedback.
export function getTypeActiveGlowColor(type: EntryType) {
  switch (type) {
    case "labour":
      return "bg-sky-500/15 border-2 border-sky-400 text-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.25)]";
    case "material":
      return "bg-emerald-500/15 border-2 border-emerald-400 text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.25)]";
    case "machinery":
      return "bg-violet-500/15 border-2 border-violet-400 text-violet-300 shadow-[0_0_16px_rgba(167,139,250,0.25)]";
    case "expense":
      return "bg-amber-500/15 border-2 border-amber-400 text-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.25)]";
    case "incident":
      return "bg-rose-500/15 border-2 border-rose-400 text-rose-300 shadow-[0_0_16px_rgba(251,113,133,0.25)]";
  }
}

export function getTypeDotColor(type: EntryType) {
  switch (type) {
    case "labour":
      return "bg-sky-400 shadow-[0_0_8px_#38bdf8]";
    case "material":
      return "bg-emerald-400 shadow-[0_0_8px_#34d399]";
    case "machinery":
      return "bg-violet-400 shadow-[0_0_8px_#a78bfa]";
    case "expense":
      return "bg-amber-400 shadow-[0_0_8px_#fbbf24]";
    case "incident":
      return "bg-rose-400 shadow-[0_0_8px_#fb7185]";
  }
}

// Kept for backward compatibility with any legacy call sites.
export function getTypeSolidColor(type: EntryType) {
  return getTypeActiveGlowColor(type);
}
