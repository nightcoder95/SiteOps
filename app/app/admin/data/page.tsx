import { DataExportPanel } from "@/components/data-export/DataExportPanel";

// Admin-only via the /app/admin layout guard (resource:manage_all -> 404 otherwise).
export default function AdminDataPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-white">Data &amp; Backups</h1>
        <p className="text-sm text-on-surface-variant">
          Download an off-platform backup of every table, or export a single table to CSV for
          spreadsheet analysis. The full backup contains all data including user contact details —
          store it somewhere safe. This is your data-loss insurance; the free tier has no
          trustworthy automatic backup.
        </p>
      </header>
      <DataExportPanel />
    </div>
  );
}
