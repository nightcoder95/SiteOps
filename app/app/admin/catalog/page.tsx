import { LayoutGrid } from "lucide-react";

import { CatalogAdminTabs } from "@/components/catalog/CatalogAdminTabs";

// Admin-only via the /app/admin layout guard (resource:manage_all -> 404 otherwise).
export default function AdminCatalogPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-6 pb-28">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-sm">
            <LayoutGrid className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Catalog Management</h1>
            <p className="mt-0.5 text-xs text-slate-400">
              Manage work types, materials, equipment, units, and tools catalog.
            </p>
          </div>
        </div>
      </header>
      <CatalogAdminTabs />
    </div>
  );
}
