import { LayoutGrid } from "lucide-react";

import { CatalogAdminTabs } from "@/components/catalog/CatalogAdminTabs";

// Admin-only via the /app/admin layout guard (resource:manage_all -> 404 otherwise).
export default function AdminCatalogPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-1 py-2">
      <header className="mb-8">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20">
            <LayoutGrid className="h-8 w-8" />
          </span>
          <h1 className="text-5xl font-extrabold tracking-tight text-white">Catalog</h1>
        </div>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-400">
          Manage the option lists behind every operation dropdown. Add, rename, reorder, or
          deactivate items. Deactivated items keep their entry history but drop out of the logging
          dropdowns.
        </p>
      </header>
      <CatalogAdminTabs />
    </div>
  );
}
