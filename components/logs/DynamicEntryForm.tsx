"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { requestJson } from "@/lib/http/client";
import { useApiResult } from "@/lib/http/useApiQuery";

// Entry form for custom ("dynamic") categories — those not in the static
// entryFieldRegistry. The form is driven by the category's approved
// field_definitions and submits one /api/entries/dynamic request per field.

type FieldDefinition = {
  fieldDefinitionId: string;
  label: string;
  fieldType: "Number" | "Text" | "Dropdown";
  unit: string | null;
  options: unknown;
};

type CategoryTree = {
  categoryId: string;
  name: string;
  subcategories: Array<{
    subcategoryId: string;
    name: string;
    fields: FieldDefinition[];
  }>;
};

type Props = {
  categoryId: string;
  categoryName: string;
  siteId?: string;
};

const labelClass = "text-[11px] font-extrabold uppercase tracking-widest text-slate-400";

export function DynamicEntryForm({ categoryId, categoryName, siteId }: Props) {
  const router = useRouter();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Cached category tree (dedupes + instant on revisit). Field definitions are
  // flattened across every subcategory; `fields === null` means still loading.
  const { data: treeResult } = useApiResult<CategoryTree>(`/api/forms/categories/${categoryId}`);
  const loadError = treeResult && !treeResult.ok ? treeResult.message : null;
  const fields = useMemo<FieldDefinition[] | null>(() => {
    if (!treeResult) return null;
    if (!treeResult.ok) return [];
    return (treeResult.data.subcategories ?? []).flatMap((s) => s.fields ?? []);
  }, [treeResult]);

  function setValue(id: string, v: string) {
    setValues((s) => ({ ...s, [id]: v }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!siteId) {
      toast.error("Site is required");
      return;
    }
    if (!fields || fields.length === 0) return;
    if (!date) {
      toast.error("Date is required");
      return;
    }

    // Only submit fields the user actually filled in.
    const filled = fields
      .map((field) => ({ field, raw: (values[field.fieldDefinitionId] ?? "").trim() }))
      .filter((x) => x.raw !== "");

    if (filled.length === 0) {
      toast.error("Enter at least one field value");
      return;
    }

    for (const { field, raw } of filled) {
      if (field.fieldType === "Number" && !Number.isFinite(Number(raw))) {
        toast.error(`${field.label} must be a number`);
        return;
      }
    }

    setSubmitting(true);
    // No cross-field transaction: each field is its own generic_entries row.
    // Submit sequentially and report partial success if one fails.
    let created = 0;
    for (const { field, raw } of filled) {
      const value = field.fieldType === "Number" ? Number(raw) : raw;
      const res = await requestJson("/api/entries/dynamic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId,
          date,
          fieldDefinitionId: field.fieldDefinitionId,
          value,
        }),
      });
      if (!res.ok) {
        setSubmitting(false);
        toast.error(
          created > 0
            ? `Saved ${created} field(s); "${field.label}" failed: ${res.message}`
            : res.message,
        );
        return;
      }
      created += 1;
    }
    setSubmitting(false);
    toast.success(`Logged ${created} field${created === 1 ? "" : "s"} for ${categoryName}`);
    router.push(siteId ? `/app/sites/${siteId}` : "/app/dashboard");
  }

  if (fields === null) {
    return <div className="card-standard p-6 text-sm text-slate-500">Loading fields…</div>;
  }

  if (fields.length === 0) {
    return (
      <div className="card-standard p-6 space-y-2">
        <p className="text-sm font-bold text-slate-300">No fields defined for this category yet.</p>
        <p className="text-xs text-slate-500">
          {loadError ??
            "Propose fields against a subcategory of this category and have an admin approve them before logging."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card-standard p-6 space-y-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="dyn-date" className={labelClass}>
          Date *
        </label>
        <input
          id="dyn-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="input-standard"
        />
      </div>

      {fields.map((field) => {
        const id = `dyn-${field.fieldDefinitionId}`;
        const opts = Array.isArray(field.options) ? (field.options as unknown[]) : [];
        return (
          <div key={field.fieldDefinitionId} className="flex flex-col gap-2">
            <label htmlFor={id} className={labelClass}>
              {field.label}
              {field.unit ? ` (${field.unit})` : ""}
            </label>
            {field.fieldType === "Dropdown" ? (
              <select
                id={id}
                value={values[field.fieldDefinitionId] ?? ""}
                onChange={(e) => setValue(field.fieldDefinitionId, e.target.value)}
                className="input-standard appearance-none bg-slate-900"
              >
                <option value="" className="bg-slate-900">
                  Select…
                </option>
                {opts.map((o) => (
                  <option key={String(o)} value={String(o)} className="bg-slate-900">
                    {String(o)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                type={field.fieldType === "Number" ? "number" : "text"}
                value={values[field.fieldDefinitionId] ?? ""}
                onChange={(e) => setValue(field.fieldDefinitionId, e.target.value)}
                className="input-standard"
              />
            )}
          </div>
        );
      })}

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary w-full py-3.5 flex items-center justify-center gap-2"
      >
        <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
          check_circle
        </span>
        {submitting ? "Saving…" : "Submit Entry"}
      </button>
    </form>
  );
}
