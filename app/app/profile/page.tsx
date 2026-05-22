'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

import { ApiUnavailableBanner } from '@/components/ui/ApiUnavailableBanner';
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

const labelClass = 'font-label-md text-label-md uppercase text-on-surface-variant';
const inputClass =
  'h-11 w-full rounded border border-outline bg-surface-container-lowest px-3 font-body-md text-body-md text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3 last:border-b-0">
      <span className={labelClass}>{label}</span>
      <span className="font-body-md text-body-md font-medium text-on-surface">{value}</span>
    </div>
  );
}

export default function ProfilePage() {
  const [result, setResult] = useState<ClientResult<ProfileResponse> | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    await supabase.auth.signOut();
    toastSuccess('Signed out successfully');
    router.replace('/auth/sign-in');
    router.refresh();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await requestJson<ProfileResponse>('/api/users/me');
      if (!cancelled) setResult(next);
    })();
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
  const user = result?.ok ? result.data.user : null;

  return (
    <div className="space-y-5 pb-20">
      <section className="card-standard flex flex-col items-center gap-2 rounded-2xl p-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
          <span className="material-symbols-outlined" style={{ fontSize: '40px', fontVariationSettings: "'FILL' 1" }}>
            account_circle
          </span>
        </div>
        <h2 className="font-headline-md text-headline-md text-on-surface">{user?.name ?? '—'}</h2>
        <p className="font-body-md text-body-md text-on-surface-variant">{user?.email ?? '—'}</p>
        <span className="mt-1 rounded-full bg-primary-container px-3 py-1 font-label-md text-label-md uppercase text-on-primary-container">
          {user?.role ?? '—'}
        </span>
      </section>

      {result && !result.ok && result.kind === 'endpoint_unavailable' ? (
        <ApiUnavailableBanner endpoint={result.endpoint} method={result.method} />
      ) : null}
      {result && !result.ok && result.kind !== 'endpoint_unavailable' ? (
        <div className="rounded-xl border border-error-container bg-error-container/30 px-4 py-3 font-body-md text-body-md text-on-error-container">
          {result.message}
        </div>
      ) : null}

      <section className="card-standard rounded-2xl">
        <header className="border-b border-outline-variant px-4 py-3">
          <h3 className="font-label-md text-label-md uppercase text-on-surface-variant">Account Details</h3>
        </header>
        <ReadOnlyRow label="Phone" value={profile?.phone ?? '—'} />
        <ReadOnlyRow label="Region" value={profile?.assignedRegion ?? '—'} />
        <ReadOnlyRow label="Designation" value={profile?.designation ?? '—'} />
      </section>

      <form onSubmit={update} className="card-standard flex flex-col gap-4 rounded-2xl p-4">
        <h3 className="text-lg font-extrabold tracking-tight text-on-surface">Update Profile</h3>
        <div className="flex flex-col gap-2">
          <label htmlFor="phone" className={labelClass}>Phone</label>
          <input id="phone" name="phone" className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="assignedRegion" className={labelClass}>Assigned Region</label>
          <input id="assignedRegion" name="assignedRegion" className={inputClass} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="designation" className={labelClass}>Designation</label>
          <input id="designation" name="designation" className={inputClass} />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded bg-primary font-label-md text-label-md uppercase text-on-primary hover:bg-surface-tint disabled:opacity-60"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>save</span>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>

      <section className="card-standard rounded-2xl p-4 flex flex-col gap-3">
        <h3 className="text-lg font-extrabold tracking-tight text-on-surface">Session Operations</h3>
        <p className="text-xs text-on-surface-variant">Sign out of your active operator session. This will clear cached resources and require authorization to command again.</p>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex h-11 w-full items-center justify-center gap-2 rounded border border-error-container bg-error-container/10 font-label-md text-label-md uppercase text-error hover:bg-error-container/20 transition-all active:scale-[0.98]"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>logout</span>
          Sign Out
        </button>
      </section>
    </div>
  );
}
