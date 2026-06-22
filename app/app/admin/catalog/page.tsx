import { CatalogAdminTabs } from "@/components/catalog/CatalogAdminTabs";

// Admin-only via the /app/admin layout guard (resource:manage_all -> 404 otherwise).
export default function AdminCatalogPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-white">Catalog</h1>
        <p className="text-sm text-on-surface-variant">
          Manage the option lists behind every operation dropdown. Add, rename, reorder, or
          deactivate items. Deactivated items keep their entry history but drop out of the logging
          dropdowns.
        </p>
      </header>
      <CatalogAdminTabs />
    </div>
  );
}
