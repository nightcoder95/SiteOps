"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ModalShell } from "@/components/ui/motion";
import { requestJson } from "@/lib/http/client";
import { notifyError } from "@/lib/ui/toast";

type UnitOption = { unitId: string; label: string };
type Mapping = { unitId: string; label: string; isDefault: boolean };
type EditorData = { mappings: Mapping[]; activeUnits: UnitOption[] };

type Props = {
  subcategoryId: string;
  name: string;
  onClose: () => void;
};

// Materials → Material Type: pick which units this material may use and the
// default. Empty selection falls back to all active units (design §3.3).
export function AllowedUnitsEditor({ subcategoryId, name, onClose }: Props) {
  const [data, setData] = useState<EditorData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [defaultUnitId, setDefaultUnitId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await requestJson<EditorData>(`/api/catalog/material-units/${subcategoryId}`);
      if (!active) return;
      if (!res.ok) {
        setLoadFailed(true);
        return;
      }
      setData(res.data);
      setSelected(new Set(res.data.mappings.map((m) => m.unitId)));
      setDefaultUnitId(res.data.mappings.find((m) => m.isDefault)?.unitId ?? null);
    })();
    return () => {
      active = false;
    };
  }, [subcategoryId]);

  function toggle(unitId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
        if (defaultUnitId === unitId) setDefaultUnitId(null);
      } else {
        next.add(unitId);
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    const unitIds = [...selected];
    const res = await requestJson(`/api/catalog/material-units/${subcategoryId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitIds, defaultUnitId: defaultUnitId ?? undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success(unitIds.length ? `Saved allowed units for "${name}"` : `Cleared allowed units for "${name}" (all units allowed)`);
    onClose();
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      className="w-full max-w-md rounded-2xl border border-outline-variant bg-surface-container-lowest p-4"
    >
      <div className="space-y-3">
        <h3 className="text-lg font-extrabold text-white">Allowed units — {name}</h3>
        {loadFailed ? (
          <p className="text-sm text-error">Failed to load units.</p>
        ) : !data ? (
          <p className="text-sm text-on-surface-variant">Loading…</p>
        ) : (
          <>
            <p className="text-xs text-on-surface-variant">
              Select the units allowed for this material. Leave all unchecked to allow every active unit.
            </p>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {data.activeUnits.map((unit) => {
                const checked = selected.has(unit.unitId);
                return (
                  <li key={unit.unitId} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-surface-container-low">
                    <label className="flex items-center gap-2 text-sm text-white">
                      <input type="checkbox" checked={checked} onChange={() => toggle(unit.unitId)} />
                      {unit.label}
                    </label>
                    <label className={`flex items-center gap-1 text-xs ${checked ? "text-on-surface-variant" : "opacity-30"}`}>
                      <input
                        type="radio"
                        name="default-unit"
                        disabled={!checked}
                        checked={defaultUnitId === unit.unitId}
                        onChange={() => setDefaultUnitId(unit.unitId)}
                      />
                      Default
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold uppercase text-on-primary disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-outline px-4 py-2.5 text-sm font-semibold uppercase text-on-surface-variant"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}
