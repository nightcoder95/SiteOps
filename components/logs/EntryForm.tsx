"use client";

import { CheckCircle2, Save, Trash2 } from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/ui/confirm";
import { notifyError, notifyGenericError } from "@/lib/ui/toast";

import { requestJson } from "@/lib/http/client";
import { useApiResult } from "@/lib/http/useApiQuery";
import type { MaterialUnitRule } from "@/lib/catalog/units";
import { pickCategoryIdByName, type CategoryRowLike } from "@/lib/catalog/selectors";
import { isSplitLabourWorkType } from "@/lib/validation/schemas";
import { entrySuccessDestination } from "@/components/operations/categoryView";
import type { Entry } from "@/components/operations/entryFormat";

import {
  resolveEntryFields,
  resolveEntryKind,
  entryEndpointFor,
  numericInputModeFor,
  type EntryField,
} from "./entryFieldRegistry";
import { validateEntryValues, type ValidationFailure } from "./EntryForm.validate";
import { SubcategoryCombobox, type SubcategoryOption } from "./SubcategoryCombobox";
import { UnitSelect, type UnitOption } from "./UnitSelect";

type Props = {
  categoryId: string;
  categoryName: string;
  siteId?: string;
  role: "Admin" | "Supervisor";
  entryId?: string;
  initialValues?: Record<string, unknown>;
  onSuccess?: () => void;
};

type FieldValue = string | number | SubcategoryOption | UnitOption | null;

const labelClass = "text-[11px] font-extrabold uppercase tracking-widest text-slate-400";
const inputClass =
  "input-standard";
const textareaClass =
  "input-standard min-h-[88px] resize-none";

function defaultValue(field: EntryField): FieldValue {
  switch (field.kind) {
    case "date":
      return new Date().toISOString().slice(0, 10);
    case "number":
    case "text":
    case "textarea":
    case "select":
      return "";
    case "subcategory":
    case "unit":
      return null;
  }
}

function selectedSubcategoryName(value: FieldValue) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && "name" in value) return String(value.name);
  return "";
}

export function EntryForm({
  categoryId,
  categoryName,
  siteId,
  role,
  entryId,
  initialValues,
  onSuccess,
}: Props) {
  const router = useRouter();
  const fields = resolveEntryFields(categoryName);
  const kind = resolveEntryKind(categoryName);
  const isEdit = Boolean(entryId);

  const [values, setValues] = useState<Record<string, FieldValue>>(() => {
    const v: Record<string, FieldValue> = {};
    for (const f of fields) {
      const raw = initialValues?.[f.name] as FieldValue | string | undefined;
      if (f.kind === "subcategory" && typeof raw === "string" && raw.trim()) {
        v[f.name] = {
          subcategoryId: `existing-${f.name}`,
          name: raw.trim(),
          categoryId,
        };
      } else if (f.kind === "unit" && raw && typeof raw === "object") {
        v[f.name] = raw as UnitOption;
      } else {
        v[f.name] = (raw as FieldValue | undefined) ?? defaultValue(f);
      }
    }
    for (const extra of [
      "salaryAmount",
      "masonCount",
      "masonSalaryAmount",
      "helperCount",
      "helperSalaryAmount",
    ]) {
      if (initialValues?.[extra] !== undefined) {
        v[extra] = initialValues[extra] as FieldValue;
      }
    }
    return v;
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fieldError, setFieldError] = useState<ValidationFailure | null>(null);

  function update(name: string, val: FieldValue) {
    // Any edit to the field we complained about clears the complaint — leaving a
    // stale "X is required" under a now-filled field is worse than no message.
    // The masonCount case covers the split-labour aggregate error, which is
    // anchored to masonCount but satisfied by editing any of the four fields.
    setFieldError((prev) => (prev && (prev.field === name || prev.field === "masonCount") ? null : prev));
    setValues((s) => ({ ...s, [name]: val }));
  }

  const selectedWorkType = selectedSubcategoryName(values.workType);
  const selectedMaterialType = selectedSubcategoryName(values.materialType);
  const splitLabour = kind === "labour" && isSplitLabourWorkType(selectedWorkType);

  // Allowed units per material type come from the server (material_type_units
  // with an all-active-units fallback). Skip the fetch until a type is picked.
  const { data: ruleResult } = useApiResult<MaterialUnitRule>(
    kind === "material" && selectedMaterialType
      ? `/api/catalog/material-units/resolve?materialType=${encodeURIComponent(selectedMaterialType)}`
      : null,
  );
  const materialUnitRule = ruleResult?.ok ? ruleResult.data : null;

  // Former-enum fields (Work Stage, Expense Category, Incident Type, Severity)
  // source their options from a managed list in a *different* category, so we
  // resolve those category ids by name (design §3.3). Skip the fetch unless the
  // form actually has a catalog-backed field.
  const hasCatalogFields = fields.some((f) => f.catalogCategoryName);
  const { data: categoriesRes } = useApiResult<CategoryRowLike[]>(
    hasCatalogFields ? "/api/forms/categories" : null,
  );
  const categoryList = categoriesRes?.ok ? categoriesRes.data : [];
  function catalogParentIdFor(field: EntryField): string {
    if (!field.catalogCategoryName) return categoryId;
    return pickCategoryIdByName(categoryList, field.catalogCategoryName) ?? "";
  }

  function validate(): ValidationFailure | null {
    return validateEntryValues({ fields, values, siteId: siteId ?? null, isEdit, splitLabour });
  }

  // After edit/delete, return to the operation's logs list (e.g. .../operations/material)
  // instead of the site detail page. New-log creation keeps landing on the site page.
  function successDestination(): string {
    if (!siteId) return "/app/dashboard";
    if (isEdit && kind !== "dynamic") {
      return `/app/sites/${siteId}/operations/${kind}`;
    }
    return `/app/sites/${siteId}`;
  }

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    if (siteId) payload.siteId = siteId;

    for (const f of fields) {
      const v = values[f.name];
      if (f.kind === "unit") {
        const unit = v as UnitOption | null;
        if (unit) {
          payload.unit = unit.name;
          payload.unitMode = unit.mode;
          if (unit.mode === "master") {
            payload.unitMasterId = unit.unitId;
          } else {
            payload.unitCustomId = unit.unitId;
          }
        }
      } else if (f.kind === "subcategory") {
        const sub = v as SubcategoryOption | null;
        if (sub) payload[f.name] = sub.name;
        else if (isEdit && f.clearable) payload[f.name] = null;   // send null → PATCH unsets it
      } else if (f.kind === "number") {
        if (v !== "" && v !== null && v !== undefined) payload[f.name] = Number(v);
      } else if (v !== "" && v !== null && v !== undefined) {
        payload[f.name] = v;
      }
    }
    if (kind === "labour" && splitLabour) {
      payload.masonCount = Number(values.masonCount || 0);
      payload.masonSalaryAmount = Number(values.masonSalaryAmount || 0);
      payload.helperCount = Number(values.helperCount || 0);
      payload.helperSalaryAmount = Number(values.helperSalaryAmount || 0);
      delete payload.peopleCount;
      delete payload.wagePerHead;
    }

    if (kind === "labour" && !splitLabour && payload.peopleCount && payload.wagePerHead) {
      payload.salaryAmount = Number(payload.peopleCount) * Number(payload.wagePerHead);
    }

    // When the material type allows exactly one unit, auto-assign it; otherwise
    // keep whatever the user picked in the unit field.
    if (kind === "material" && materialUnitRule && materialUnitRule.allowedNames.length === 1) {
      payload.unit = materialUnitRule.preferredName;
    }
    return payload;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setFieldError(err);
      // notifyGenericError is the string escape hatch (notifyError needs a
      // ClientResult). The message comes from our own validator, never a backend
      // string, so toast discipline is preserved.
      notifyGenericError(err.message);
      // Bring the offending field into view — on a long form the inline error is
      // otherwise off-screen. Prefer the input itself (focusable); fall back to
      // the row wrapper for pickers that render no input id. `siteId` has no
      // rendered row at all, hence the optional chaining.
      if (typeof document !== "undefined") {
        const el =
          document.getElementById(`field-${err.field}`) ??
          document.getElementById(`fieldrow-${err.field}`);
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
        (el as HTMLElement | null)?.focus?.({ preventScroll: true });
      }
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    const payload = buildPayload();
    const url = isEdit ? `/api/entries/${entryId}?type=${kind}` : entryEndpointFor(kind);
    const method = isEdit ? "PATCH" : "POST";

    const res = await requestJson<unknown>(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);

    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success(isEdit ? "Entry updated" : "Entry created");
    if (onSuccess) { onSuccess(); return; }
    const spend = kind === "material" || kind === "expense" || kind === "labour" || kind === "machinery";
    if (spend && res.data) {
      router.push(entrySuccessDestination(res.data as Entry, kind, siteId ?? ""));
    } else {
      router.push(successDestination());
    }
  }

  async function handleDelete() {
    if (!entryId || kind === "dynamic") return;
    const confirmed = await confirmDialog({
      title: "Delete Log Entry",
      message: "Are you sure you want to delete this log entry? This action cannot be undone.",
      confirmLabel: "Delete Entry",
      tone: "danger",
    });
    if (!confirmed) return;
    setDeleting(true);
    const res = await requestJson<null>(`/api/entries/${entryId}?type=${kind}`, {
      method: "DELETE",
    });
    setDeleting(false);
    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success("Entry deleted");
    router.push(successDestination());
  }

  return (
    <form onSubmit={handleSubmit} className="card-standard p-6 space-y-5">
      {fields.map((f) => {
        if (splitLabour && f.name === "wagePerHead") return null;
        if (splitLabour && f.name === "peopleCount") {
          return (
            <SplitLabourFields
              key="split-labour-fields"
              values={values}
              update={update}
              error={fieldError?.field === "masonCount" ? fieldError.message : undefined}
            />
          );
        }
        return (
          <FieldRow
            key={f.name}
            field={f}
            value={values[f.name]}
            onChange={(v) => update(f.name, v)}
            categoryId={catalogParentIdFor(f)}
            role={role}
            siteId={siteId}
            allowedUnitNames={kind === "material" ? (materialUnitRule?.allowedNames ?? undefined) : undefined}
            error={fieldError?.field === f.name ? fieldError.message : undefined}
          />
        );
      })}
      <div className="pt-4 space-y-3">
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full py-3.5 flex items-center justify-center gap-2"
        >
          {isEdit ? <Save className="w-[18px] h-[18px]" /> : <CheckCircle2 className="w-[18px] h-[18px]" />}
          {submitting ? "Saving…" : isEdit ? "Update Entry" : "Submit Entry"}
        </button>
        {isEdit ? (
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-[11px] font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50"
          >
            <Trash2 className="w-[18px] h-[18px]" />
            {deleting ? "Deleting…" : "Delete Entry"}
          </button>
        ) : null}
      </div>
    </form>
  );
}

// Row wrapper: owns the scroll anchor and the inline validation slot so every
// field kind (including the pickers that render their own label) gets both.
function Field({
  name,
  error,
  children,
}: {
  name: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2" id={`fieldrow-${name}`}>
      {children}
      {error ? (
        // 12px floor — this is content a user must read, not decoration.
        <p role="alert" className="text-xs font-semibold text-rose-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
  categoryId,
  role,
  siteId,
  allowedUnitNames,
  error,
}: {
  field: EntryField;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  categoryId: string;
  role: "Admin" | "Supervisor";
  siteId?: string;
  allowedUnitNames?: string[];
  error?: string;
}) {
  const id = `field-${field.name}`;

  if (field.kind === "unit") {
    return (
      <Field name={field.name} error={error}>
        <UnitSelect
          label={field.label}
          value={value as UnitOption | null}
          onChange={onChange}
          required={field.required}
          allowedNames={allowedUnitNames}
        />
      </Field>
    );
  }

  if (field.kind === "subcategory") {
    return (
      <Field name={field.name} error={error}>
        <SubcategoryCombobox
          label={field.label}
          noun={field.noun}
          parentCategoryId={categoryId}
          value={value as SubcategoryOption | null}
          onChange={onChange}
          required={field.required}
          role={role}
          siteId={siteId}
        />
      </Field>
    );
  }

  if (field.kind === "select") {
    return (
      <Field name={field.name} error={error}>
        <label htmlFor={id} className={labelClass}>
          {field.label}
          {field.required && " *"}
        </label>
        <select
          id={id}
          value={String(value ?? "")}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
          required={field.required}
          className={`${inputClass} appearance-none bg-slate-900`}
        >
          <option value="" className="bg-slate-900">Select…</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value} className="bg-slate-900">
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  if (field.kind === "textarea") {
    return (
      <Field name={field.name} error={error}>
        <label htmlFor={id} className={labelClass}>
          {field.label}
          {field.required && " *"}
        </label>
        <textarea
          id={id}
          rows={3}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className={textareaClass}
        />
      </Field>
    );
  }

  return (
    <Field name={field.name} error={error}>
      <label htmlFor={id} className={labelClass}>
        {field.label}
        {field.required && " *"}
      </label>
      <input
        id={id}
        type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"}
        inputMode={numericInputModeFor(field)}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        min={field.min}
        max={field.max}
        step={field.step}
        placeholder={field.placeholder}
        required={field.required}
        className={inputClass}
      />
    </Field>
  );
}

function SplitLabourFields({
  values,
  update,
  error,
}: {
  values: Record<string, FieldValue>;
  update: (name: string, val: FieldValue) => void;
  error?: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {error ? (
        <p id="field-masonCount" role="alert" className="md:col-span-2 text-xs font-semibold text-rose-400">
          {error}
        </p>
      ) : (
        // Keeps the scroll anchor resolvable on the very first submit, before
        // the error node has been rendered.
        <span id="field-masonCount" className="hidden" aria-hidden="true" />
      )}
      {[
        ["Mason", "masonCount", "masonSalaryAmount"],
        ["Helper", "helperCount", "helperSalaryAmount"],
      ].map(([label, countName, amountName]) => (
        <section key={label} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-sky-400">{label}</p>
          <div className="space-y-2">
            <label htmlFor={`split-${countName}`} className={labelClass}>Count</label>
            <input
              id={`split-${countName}`}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={String(values[countName] ?? "")}
              onChange={(event) => update(countName, event.target.value)}
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor={`split-${amountName}`} className={labelClass}>Salary Amount</label>
            <input
              id={`split-${amountName}`}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={String(values[amountName] ?? "")}
              onChange={(event) => update(amountName, event.target.value)}
              className={inputClass}
            />
          </div>
        </section>
      ))}
    </div>
  );
}
