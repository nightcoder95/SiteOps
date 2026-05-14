'use client';

import { useEffect, useState } from 'react';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
import { PageHero, PageStack } from '@/components/ui/page-primitives';
import { requestJson, type ClientResult } from '@/lib/http/client';
import { toastClientError, toastSuccess } from '@/lib/ui/toast';

type ProfileResponse = {
  user: {
    id: string;
    name: string | null;
    email: string;
    role: 'Admin' | 'Supervisor';
  };
  profile: {
    phone: string | null;
    assignedRegion: string | null;
    designation: string | null;
  } | null;
};

export default function ProfilePage() {
  const [result, setResult] = useState<ClientResult<ProfileResponse> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const next = await requestJson<ProfileResponse>('/api/users/me');
      if (!cancelled) setResult(next);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function update(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const payload: Record<string, string> = {};
    const phone = String(fd.get('phone') ?? '').trim();
    const assignedRegion = String(fd.get('assignedRegion') ?? '').trim();
    const designation = String(fd.get('designation') ?? '').trim();
    if (phone) payload.phone = phone;
    if (assignedRegion) payload.assignedRegion = assignedRegion;
    if (designation) payload.designation = designation;

    setSaving(true);

    const next = await requestJson<ProfileResponse>('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setSaving(false);

    if (next.ok) {
      setResult(next);
      toastSuccess('Profile updated');
    } else {
      toastClientError(next);
      setResult(next);
    }
  }

  const profile = result?.ok ? result.data.profile : null;

  return (
    <PageStack>
      <PageHero
        eyebrow="Profile"
        title="Session and settings"
        description="This page reads the live session profile and patches the current user record through the API."
      />

      {result && !result.ok && result.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={result.endpoint} method={result.method} />
      ) : null}
      {result && !result.ok && result.kind !== 'endpoint_unavailable' ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          {result.message}
        </div>
      ) : null}
      <section className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="grid gap-3 text-sm">
          <div className="rounded-2xl bg-surface-container-low px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">Name</div>
            <div className="mt-1 font-black text-on-surface">{result?.ok ? result.data.user.name ?? '—' : '—'}</div>
          </div>
          <div className="rounded-2xl bg-surface-container-low px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">Email</div>
            <div className="mt-1 font-black text-on-surface">{result?.ok ? result.data.user.email : '—'}</div>
          </div>
          <div className="rounded-2xl bg-surface-container-low px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">Role</div>
            <div className="mt-1 font-black text-on-surface">{result?.ok ? result.data.user.role : '—'}</div>
          </div>
          <div className="rounded-2xl bg-surface-container-low px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">Phone</div>
            <div className="mt-1 font-black text-on-surface">{profile?.phone ?? '—'}</div>
          </div>
          <div className="rounded-2xl bg-surface-container-low px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">Region</div>
            <div className="mt-1 font-black text-on-surface">{profile?.assignedRegion ?? '—'}</div>
          </div>
          <div className="rounded-2xl bg-surface-container-low px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-on-surface-variant">Designation</div>
            <div className="mt-1 font-black text-on-surface">{profile?.designation ?? '—'}</div>
          </div>
        </div>
      </section>

      <form onSubmit={update} className="rounded-[1.75rem] border border-outline-variant bg-surface p-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <h3 className="text-lg font-black text-on-surface">Update profile</h3>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-2 text-sm font-semibold text-on-surface">
            Phone
            <input name="phone" className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-on-surface">
            Assigned Region
            <input name="assignedRegion" className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-on-surface">
            Designation
            <input name="designation" className="rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-base text-on-surface" />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-machined-gradient px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary/20 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </PageStack>
  );
}
