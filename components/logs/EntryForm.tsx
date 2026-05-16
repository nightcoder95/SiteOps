"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { requestJson } from "@/lib/http/client";

import {
  resolveEntryFields,
  resolveEntryKind,
  entryEndpointFor,
  type EntryField,
} from "./entryFieldRegistry";
import { SubcategoryCombobox, type SubcategoryOption } from "./SubcategoryCombobox";

type Props = {
  categoryId: string;
  categoryName: string;
  siteId?: string;
  role: "Admin" | "Supervisor";
  entryId?: string;
  initialValues?: Record<string, unknown>;
  onSuccess?: () => void;
};

type FieldValue = string | number | SubcategoryOption | null;

const labelClass = "font-label-md text-label-md uppercase text-on-surface-variant";
const inputClass =
  "h-11 w-full rounded border border-outline bg-surface-container-lowest px-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const textareaClass =
  "min-h-[88px] w-full rounded border border-outline bg-surface-container-lowest p-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

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
      return null;
  }
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
      } else {
        v[f.name] = (raw as FieldValue | undefined) ?? defaultValue(f);
      }
    }
    return v;
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function update(name: string, val: FieldValue) {
    setValues((s) => ({ ...s, [name]: val }));
  }

  function validate(): string | null {
    if (!siteId && !isEdit) return "Site is required";
    for (const f of fields) {
      if (!f.required) continue;
      const v = values[f.name];
      if (f.kind === "subcategory") {
        if (!v) return `${f.label} is required`;
        continue;
      }
      if (v === "" || v === null || v === undefined) return `${f.label} is required`;
    }
    return null;
  }

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    if (siteId) payload.siteId = siteId;

    for (const f of fields) {
      const v = values[f.name];
      if (f.kind === "subcategory") {
        const sub = v as SubcategoryOption | null;
        if (sub) {
          payload[f.name] = sub.name;
        }
      } else if (f.kind === "number") {
        if (v !== "" && v !== null && v !== undefined) payload[f.name] = Number(v);
      } else if (v !== "" && v !== null && v !== undefined) {
        payload[f.name] = v;
      }
    }
    return payload;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    if (kind === "dynamic") {
      toast.error(
        "Custom category entries are not supported yet. Pick Labour, Material, Machinery, Expense, or Incident.",
      );
      return;
    }

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
      toast.error(res.message);
      return;
    }
    toast.success(isEdit ? "Entry updated" : "Entry created");
    if (onSuccess) onSuccess();
    else if (siteId) router.push(`/app/sites/${siteId}`);
    else router.push("/app/dashboard");
  }

  async function handleDelete() {
    if (!entryId || kind === "dynamic") return;
    const confirmed = window.confirm("Delete this log entry?");
    if (!confirmed) return;
    setDeleting(true);
    const res = await requestJson<null>(`/api/entries/${entryId}?type=${kind}`, {
      method: "DELETE",
    });
    setDeleting(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    toast.success("Entry deleted");
    if (siteId) {
      router.push(`/app/sites/${siteId}`);
      return;
    }
    router.push("/app/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      {fields.map((f) => (
        <FieldRow
          key={f.name}
          field={f}
          value={values[f.name]}
          onChange={(v) => update(f.name, v)}
          categoryId={categoryId}
          role={role}
          siteId={siteId}
        />
      ))}
      <button
        type="submit"
        disabled={submitting}
        className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded bg-primary font-label-md text-label-md uppercase text-on-primary hover:bg-surface-tint disabled:opacity-60"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
          {isEdit ? 'save' : 'check_circle'}
        </span>
        {submitting ? "Saving…" : isEdit ? "Update Entry" : "Submit Entry"}
      </button>
      {isEdit ? (
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={deleting}
          className="flex h-11 w-full items-center justify-center gap-2 rounded border border-error/40 bg-error/10 font-label-md text-label-md uppercase text-error disabled:opacity-60"
        >
          <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>delete</span>
          {deleting ? "Deleting…" : "Delete Entry"}
        </button>
      ) : null}
    </form>
  );
}

function FieldRow({
  field,
  value,
  onChange,
  categoryId,
  role,
  siteId,
}: {
  field: EntryField;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
  categoryId: string;
  role: "Admin" | "Supervisor";
  siteId?: string;
}) {
  const id = `field-${field.name}`;

  if (field.kind === "subcategory") {
    return (
      <SubcategoryCombobox
        label={field.label}
        parentCategoryId={categoryId}
        value={value as SubcategoryOption | null}
        onChange={onChange}
        required={field.required}
        role={role}
        siteId={siteId}
      />
    );
  }

  if (field.kind === "select") {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={id} className={labelClass}>
          {field.label}
          {field.required && " *"}
        </label>
        <select
          id={id}
          value={String(value ?? "")}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
          required={field.required}
          className={inputClass}
        >
          <option value="">Select…</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.kind === "textarea") {
    return (
      <div className="flex flex-col gap-2">
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={labelClass}>
        {field.label}
        {field.required && " *"}
      </label>
      <input
        id={id}
        type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        min={field.min}
        max={field.max}
        step={field.step}
        placeholder={field.placeholder}
        required={field.required}
        className={inputClass}
      />
    </div>
  );
}
