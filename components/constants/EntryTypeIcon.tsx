import { AlertCircle } from "lucide-react";

/**
 * Source of truth for category icons (labour / material / machinery / expense).
 * machinery + equipment both map to the equipment art.
 * incident has no PNG art — falls back to a lucide glyph.
 */
export const entryTypeIconSrc: Record<string, string | null> = {
  labour: "/icons/labour-icon.png",
  material: "/icons/materials-icon.png",
  materials: "/icons/materials-icon.png",
  machinery: "/icons/equipment-icon.png",
  equipment: "/icons/equipment-icon.png",
  expense: "/icons/expenses-icon.png",
  expenses: "/icons/expenses-icon.png",
  incident: null,
};

/**
 * Best-effort map a free-text category name (e.g. "MACHINERY/EQUIPMENT") to a
 * known entry type so it can render the PNG art. Returns null when no match.
 */
export function entryTypeFromName(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("labour") || n.includes("labor")) return "labour";
  if (n.includes("machinery") || n.includes("equipment")) return "machinery";
  if (n.includes("material")) return "material";
  if (n.includes("expense")) return "expense";
  return null;
}

type Props = {
  type: string;
  className?: string;
  /** Fallback lucide class colors only apply when no PNG exists (e.g. incident). */
  alt?: string;
};

export function EntryTypeIcon({ type, className, alt }: Props) {
  const src = entryTypeIconSrc[type];
  if (!src) return <AlertCircle className={className} aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt ?? ""} aria-hidden={alt ? undefined : true} className={className} />
  );
}
