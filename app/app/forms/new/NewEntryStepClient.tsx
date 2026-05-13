'use client';

// Route contract: /app/forms/new (Supervisor/Admin)

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { requestJson, type ClientResult } from '@/lib/http/client';
import { buildFormsSelectionHref, parseNewStepParams } from '@/lib/navigation/formsFlow';

type Field = {
  id: number;
  fieldDefinitionId: string;
  label: string;
  fieldType: 'Number' | 'Text' | 'Dropdown';
  unit: string | null;
  options: unknown;
};

type CategoryDetail = {
  id: number;
  categoryId: string;
  name: string;
  subcategories: Array<{
    id: number;
    subcategoryId: string;
    name: string;
    fields: Field[];
  }>;
};

export function NewEntryStepClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsed = useMemo(() => parseNewStepParams(searchParams), [searchParams]);
  const [result, setResult] = useState<ClientResult<CategoryDetail> | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(parsed.ok ? parsed.fieldDefinitionId : null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<ClientResult<unknown> | null>(null);
  const [value, setValue] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!parsed.ok) {
      router.replace(parsed.redirectTo);
    }
  }, [parsed, router]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!parsed.ok) return;
      const next = await requestJson<CategoryDetail>(`/api/forms/categories/${parsed.categoryId}`);
      if (!cancelled) setResult(next);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [parsed]);

  useEffect(() => {
    if (!parsed.ok) return;
    if (!selectedFieldId && result?.ok) {
      const firstField = result.data.subcategories.find((entry) => entry.subcategoryId === parsed.subcategoryId)?.fields[0];
      if (firstField) setSelectedFieldId(firstField.fieldDefinitionId);
    }
  }, [parsed, result, selectedFieldId]);

  if (!parsed.ok) {
    return <div className="rounded-3xl border border-outline-variant bg-surface px-4 py-6 text-sm font-medium text-on-surface-variant">Redirecting...</div>;
  }

  const { siteId, categoryId, subcategoryId } = parsed;
  const subcategory = result?.ok
    ? result.data.subcategories.find((entry) => entry.subcategoryId === subcategoryId) ?? null
    : null;
  const fields = subcategory?.fields ?? [];
  const selectedField = fields.find((field) => field.fieldDefinitionId === selectedFieldId) ?? null;

  async function submit() {
    if (!selectedField) return;
    setSubmitting(true);
    setStatus(null);
    setError(null);

    const payload = {
      siteId,
      date,
      fieldDefinitionId: selectedField.fieldDefinitionId,
      value: selectedField.fieldType === 'Number' ? Number(value) : value,
    };

    const next = await requestJson('/api/entries/dynamic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!next.ok) {
      setError(next);
      return;
    }

    setStatus('Entry submitted');
    setValue('');
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[2rem] bg-[linear-gradient(135deg,#fff7ed_0%,#fff_55%,#e2e8f0_100%)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-on-surface-variant">Step 4 of 4</p>
        <h2 className="mt-2 text-2xl font-black text-on-surface">{subcategory?.name ?? 'Create a new entry'}</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium text-on-surface-variant">
          Choose a field, enter a value, and submit it directly to the live API.
        </p>
      </section>

      {result && !result.ok && result.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={result.endpoint} method={result.method} />
      ) : null}

      {result && !result.ok && result.kind !== 'endpoint_unavailable' ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {result.message}
        </div>
      ) : null}

      {error && !error.ok ? (
        error.kind === 'endpoint_unavailable' ? (
          <ApiUnavailableBanner endpoint={error.endpoint} method={error.method} />
        ) : (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
            {error.message}
          </div>
        )
      ) : null}

      {status ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {status}
        </div>
      ) : null}

      {result?.ok ? (
        fields.length > 0 ? (
          <section className="grid gap-3">
            <div className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
              <div className="flex flex-wrap gap-2">
                {fields.map((field) => (
                  <button
                    key={field.fieldDefinitionId}
                    type="button"
                    onClick={() => setSelectedFieldId(field.fieldDefinitionId)}
                    className={[
                      'rounded-full px-4 py-2 text-sm font-black transition',
                      selectedFieldId === field.fieldDefinitionId
                        ? 'bg-machined-gradient text-white'
                        : 'bg-surface-container-low text-on-surface-variant',
                    ].join(' ')}
                  >
                    {field.label}
                  </button>
                ))}
              </div>
            </div>

            {selectedField ? (
              <section className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black text-on-surface">{selectedField.label}</h3>
                    <p className="mt-1 text-sm font-medium text-on-surface-variant">
                      {selectedField.fieldType}
                      {selectedField.unit ? ` • ${selectedField.unit}` : ''}
                    </p>
                  </div>
                  <Link
                    href={buildFormsSelectionHref('subcategory', {
                      siteId,
                      categoryId,
                    })}
                    className="rounded-full bg-surface-container-low px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-on-surface-variant"
                  >
                    Change step
                  </Link>
                </div>

                <div className="mt-4 grid gap-3">
                  <label className="grid gap-2 text-sm font-semibold text-on-surface">
                    Date
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface"
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-semibold text-on-surface">
                    Value
                    <input
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      type={selectedField.fieldType === 'Number' ? 'number' : 'text'}
                      placeholder={selectedField.fieldType}
                      className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface"
                    />
                  </label>

                  <button
                    type="button"
                    disabled={submitting || value.trim().length === 0}
                    onClick={submit}
                    className="rounded-full bg-machined-gradient px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary/20 disabled:opacity-60"
                  >
                    {submitting ? 'Submitting...' : 'Submit entry'}
                  </button>
                </div>
              </section>
            ) : null}
          </section>
        ) : (
          <div className="rounded-3xl border border-outline-variant bg-surface px-4 py-6 text-sm font-medium text-on-surface-variant">
            No fields are configured for this subcategory.
          </div>
        )
      ) : (
        <div className="rounded-3xl border border-outline-variant bg-surface px-4 py-6 text-sm font-medium text-on-surface-variant">
          Loading fields...
        </div>
      )}
    </div>
  );
}
