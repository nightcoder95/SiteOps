type NameParts = { fullName: string | null; designation: string | null };

function titleCase(part: string): string {
  // Drop email plus-addressing (e.g. "mary-jane+tag" → "mary-jane") before splitting.
  return part
    .replace(/\+.*$/, "")
    .split(/[.\-_]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Human label for a supervisor/user: fullName → email-derived → designation → email → short id. */
export function displayName(parts: NameParts, email: string | null, userId?: string): string {
  if (parts.fullName && parts.fullName.trim()) return parts.fullName.trim();

  if (email && email.includes("@")) {
    const local = email.slice(0, email.indexOf("@"));
    const cased = titleCase(local);
    if (cased) return cased;
  }

  if (parts.designation && parts.designation.trim()) return parts.designation.trim();
  if (email) return email;
  return (userId ?? "").slice(0, 8) || "Unknown";
}
