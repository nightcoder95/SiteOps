'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, UserPlus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { notifyError } from '@/lib/ui/toast';

import { ALL_ROLES, type Role } from '@/lib/auth/roles';
import { requestJson } from '@/lib/http/client';
import { useApiResult } from '@/lib/http/useApiQuery';

type AdminUser = {
  userId: string;
  email: string | null;
  role: Role;
  designation: string | null;
  mustChangePassword: boolean;
};

const labelClass = 'text-xs font-semibold uppercase text-on-surface-variant';
const inputClass =
  'h-11 w-full rounded border border-outline bg-surface-container-lowest px-3 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

export default function AdminUsersPage() {
  // SWR owns the fetch (cache-then-revalidate + dedupe). `users` is a local
  // working copy so role changes can pessimistically patch a single row
  // (server is the authority — see handleRoleChange) without a full refetch.
  const { data: listResult, mutate } = useApiResult<AdminUser[]>('/api/admin/users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (listResult?.ok) setUsers(listResult.data);
  }, [listResult]);

  // Create-account form
  const [email, setEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [role, setRole] = useState<Role>('Supervisor');
  const [designation, setDesignation] = useState('');
  const [creating, setCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    await mutate();
  }, [mutate]);

  async function handleRoleChange(userId: string, nextRole: Role) {
    setSavingId(userId);
    const res = await requestJson<{ role: Role; changed: boolean; note?: string }>(
      `/api/admin/users/${userId}/role`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      },
    );
    setSavingId(null);

    if (!res.ok) {
      notifyError(res);
      void loadUsers(); // resync the dropdown to the server's truth
      return;
    }
    setUsers((prev) => prev.map((u) => (u.userId === userId ? { ...u, role: res.data.role } : u)));
    toast.success(res.data.note ?? 'Role updated');
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || tempPassword.length < 8) {
      toast.error('Email and a temp password of at least 8 characters are required');
      return;
    }
    setCreating(true);
    const res = await requestJson<{ userId: string }>('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        tempPassword,
        role,
        designation: designation.trim() || undefined,
      }),
    });
    setCreating(false);

    if (!res.ok) {
      notifyError(res);
      return;
    }
    toast.success('Account created. Share the temp password with the user.');
    setEmail('');
    setTempPassword('');
    setDesignation('');
    setRole('Supervisor');
    void loadUsers();
  }

  return (
    <div className="space-y-6">
      <section className="card-standard p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-on-surface-variant">Access</p>
        <h2 className="mt-2 text-2xl font-black text-on-surface">User management</h2>
        <p className="mt-2 max-w-2xl text-sm font-medium text-on-surface-variant">
          Provision accounts and manage roles. New users sign in with the temp password and are
          forced to set a new one.
        </p>
      </section>

      <section className="card-standard p-5">
        <h3 className="flex items-center gap-2 text-lg font-black text-on-surface">
          <UserPlus className="h-5 w-5" /> Create account
        </h3>
        <form onSubmit={handleCreate} className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className={labelClass}>Email *</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="tempPassword" className={labelClass}>Temp password *</label>
            <input id="tempPassword" type="text" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} required minLength={8} className={inputClass} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="role" className={labelClass}>Role *</label>
            <select id="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="designation" className={labelClass}>Designation</label>
            <input id="designation" type="text" value={designation} onChange={(e) => setDesignation(e.target.value)} maxLength={100} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="flex h-11 items-center justify-center gap-2 rounded bg-primary px-5 text-xs font-semibold uppercase text-on-primary hover:bg-sky-400 disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {creating ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      </section>

      <section className="card-standard p-5">
        <h3 className="flex items-center gap-2 text-lg font-black text-on-surface">
          <ShieldCheck className="h-5 w-5" /> Accounts
        </h3>

        {listResult && !listResult.ok ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">
            {listResult.message}
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {users.map((u) => (
            <div
              key={u.userId}
              className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-on-surface">{u.email ?? u.userId}</p>
                <p className="text-xs text-on-surface-variant">
                  {u.designation ?? '—'}
                  {u.mustChangePassword ? ' · temp password pending' : ''}
                </p>
              </div>
              <select
                value={u.role}
                disabled={savingId === u.userId}
                onChange={(e) => handleRoleChange(u.userId, e.target.value as Role)}
                className="h-10 rounded border border-outline bg-surface-container-lowest px-3 text-sm text-on-surface focus:border-primary focus:outline-none disabled:opacity-60"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          ))}
          {listResult?.ok && users.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No accounts yet.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
