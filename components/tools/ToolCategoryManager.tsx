"use client";

import { useState } from "react";
import { toast } from "sonner";

import { RenameModal } from "@/components/catalog/RenameModal";
import { RowActionsMenu, type RowAction } from "@/components/catalog/RowActionsMenu";
import { useToolCategories, useToolMutations, type ToolCategoryDTO } from "@/lib/client/tools";
import { notifyError } from "@/lib/ui/toast";

// Tool categories CRUD. Categories are deactivated (not deleted) when tools
// reference them — the FK restrict on tools.category_id backs this (case 9).
export function ToolCategoryManager() {
  const { data: result, mutate, isLoading } = useToolCategories();
  const { createCategory, updateCategory } = useToolMutations();
  const [showInactive, setShowInactive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<ToolCategoryDTO | null>(null);
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");

  const categories = result?.ok ? result.data.categories : [];
  const visible = showInactive ? categories : categories.filter((c) => c.isActive);

  async function create() {
    const n = name.trim();
    const p = prefix.trim();
    if (!n || !p) return;
    setBusyId("__new");
    const res = await createCategory({ name: n, codePrefix: p });
    setBusyId(null);
    if (!res.ok) return notifyError(res);
    toast.success(`Added category "${res.data.name}" (${res.data.codePrefix})`);
    setName("");
    setPrefix("");
    await mutate();
  }

  async function patch(cat: ToolCategoryDTO, body: Parameters<typeof updateCategory>[1], msg: string) {
    setBusyId(cat.categoryId);
    const res = await updateCategory(cat.categoryId, body);
    setBusyId(null);
    if (!res.ok) return notifyError(res);
    toast.success(msg);
    await mutate();
  }

  function rename(cat: ToolCategoryDTO) {
    setRenaming(cat);
  }

  // Returns true so RenameModal closes only on a successful PATCH; on failure
  // the modal stays open with the user's text intact. Deliberately not `patch()`
  // — that helper cannot report success/failure back to the modal.
  async function submitRename(nextName: string): Promise<boolean> {
    const cat = renaming;
    if (!cat) return true;
    setBusyId(cat.categoryId);
    const res = await updateCategory(cat.categoryId, { name: nextName });
    setBusyId(null);
    if (!res.ok) {
      notifyError(res);
      return false;
    }
    toast.success(`Renamed to "${nextName}"`);
    await mutate();
    return true;
  }

  // Single source of truth for a row's actions, shared by the desktop table and
  // the mobile overflow menu so behaviour can't drift between the two.
  function rowActions(cat: ToolCategoryDTO): RowAction[] {
    const busy = busyId === cat.categoryId;
    return [
      { label: "Rename", tone: "text-sky-400", onSelect: () => rename(cat), disabled: busy },
      {
        label: cat.isActive ? "Deactivate" : "Activate",
        tone: "text-amber-400",
        onSelect: () => void patch(cat, { isActive: !cat.isActive }, cat.isActive ? "Deactivated" : "Activated"),
        disabled: busy,
      },
    ];
  }

  if (isLoading) return <p className="text-sm text-on-surface-variant">Loading categories…</p>;
  if (result && !result.ok) return <p className="text-sm text-error">Failed to load categories.</p>;

  return (
    <div className="space-y-4">
      {/* Add category — one grouped bar, consistent with the Tools toolbar. */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-2">
        <input
          aria-label="Category name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category (e.g. Ladder)"
          className="h-10 min-w-[10rem] flex-1 rounded-xl border border-outline bg-surface-container-low px-3 text-sm text-on-surface"
        />
        <input
          aria-label="Code prefix"
          type="text"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.toUpperCase())}
          placeholder="Prefix"
          maxLength={8}
          className="h-10 w-24 rounded-xl border border-outline bg-surface-container-low px-3 text-sm uppercase text-on-surface"
        />
        <button
          type="button"
          disabled={!name.trim() || !prefix.trim() || busyId === "__new"}
          onClick={() => void create()}
          className="h-10 shrink-0 cursor-pointer rounded-xl bg-primary px-4 text-sm font-bold text-on-primary transition-colors hover:opacity-90 disabled:opacity-40"
        >
          Add
        </button>
      </div>

      <label className="flex items-center gap-2 text-xs font-semibold uppercase text-on-surface-variant">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        Show inactive
      </label>

      {visible.length === 0 ? (
        <p className="text-sm text-on-surface-variant">No categories yet.</p>
      ) : (
        <>
          {/* Mobile: stacked cards + overflow menu so nothing overflows the viewport. */}
          <ul className="space-y-2 md:hidden">
            {visible.map((cat) => (
              <li
                key={cat.categoryId}
                className={`flex items-start justify-between gap-3 rounded-xl border border-outline-variant/60 bg-surface-container-low px-3 py-3 ${cat.isActive ? "" : "opacity-50"}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-white">{cat.name}</p>
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-on-surface-variant">
                      {cat.codePrefix}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-on-surface-variant">
                    <span
                      aria-hidden
                      className={`inline-block h-1.5 w-1.5 rounded-full ${cat.isActive ? "bg-emerald-400" : "bg-slate-500"}`}
                    />
                    {cat.isActive ? "Active" : "Inactive"}
                  </p>
                </div>
                <RowActionsMenu actions={rowActions(cat)} label={`Actions for ${cat.name}`} />
              </li>
            ))}
          </ul>

          {/* Desktop: full table. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-outline-variant bg-surface-container-lowest md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-slate-400">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Prefix</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40">
                {visible.map((cat) => (
                  <tr key={cat.categoryId} className={`transition-colors hover:bg-surface-container-low ${cat.isActive ? "" : "opacity-50"}`}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-white">{cat.name}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-xs text-on-surface-variant">
                        {cat.codePrefix}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{cat.isActive ? "Active" : "Inactive"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          disabled={busyId === cat.categoryId}
                          onClick={() => rename(cat)}
                          className="cursor-pointer rounded px-2 py-1 text-sky-400 transition-colors hover:bg-sky-500/10 disabled:opacity-40"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          disabled={busyId === cat.categoryId}
                          onClick={() => void patch(cat, { isActive: !cat.isActive }, cat.isActive ? "Deactivated" : "Activated")}
                          className="cursor-pointer rounded px-2 py-1 text-amber-400 transition-colors hover:bg-amber-500/10 disabled:opacity-40"
                        >
                          {cat.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <RenameModal
        open={renaming !== null}
        noun="Tool Category"
        currentName={renaming?.name ?? ""}
        onClose={() => setRenaming(null)}
        onSubmit={submitRename}
      />
    </div>
  );
}
