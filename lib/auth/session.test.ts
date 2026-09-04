import { describe, expect, it, vi } from 'vitest';

import { getSessionUserFromHeaders, safeGetSessionFromHeaders } from '@/lib/auth/session';

describe('getSessionUserFromHeaders', () => {
  it('returns null when middleware has not injected user headers', () => {
    expect(getSessionUserFromHeaders(new Headers())).toBeNull();
  });

  it('uses forwarded role header when present', () => {
    const headers = new Headers({
      'x-siteops-user-id': 'u_1',
      'x-siteops-user-email': 'admin@example.com',
      'x-siteops-user-role': 'Admin',
    });

    expect(getSessionUserFromHeaders(headers)).toEqual({
      id: 'u_1',
      email: 'admin@example.com',
      role: 'Admin',
    });
  });

  it('defaults to Supervisor when role header is absent', () => {
    const headers = new Headers({
      'x-siteops-user-id': 'u_2',
      'x-siteops-user-email': 'supervisor@example.com',
    });

    expect(getSessionUserFromHeaders(headers)).toEqual({
      id: 'u_2',
      email: 'supervisor@example.com',
      role: 'Supervisor',
    });
  });

  it('defaults to Supervisor when role header is an unknown value', () => {
    const headers = new Headers({
      'x-siteops-user-id': 'u_3',
      'x-siteops-user-email': 'u3@example.com',
      'x-siteops-user-role': 'Bogus',
    });

    expect(getSessionUserFromHeaders(headers)).toEqual({
      id: 'u_3',
      email: 'u3@example.com',
      role: 'Supervisor',
    });
  });
});

describe('safeGetSessionFromHeaders', () => {
  it('returns wrapped session user shape for guard compatibility', () => {
    const headers = new Headers({
      'x-siteops-user-id': 'u_3',
      'x-siteops-user-email': 'u3@example.com',
      'x-siteops-user-role': 'Supervisor',
    });

    expect(safeGetSessionFromHeaders(headers)).toEqual({
      user: {
        id: 'u_3',
        email: 'u3@example.com',
        role: 'Supervisor',
      },
    });
  });

  it('returns null when no user id header present', () => {
    expect(safeGetSessionFromHeaders(new Headers())).toBeNull();
  });
});

describe('auth_role_claim_missing instrumentation (S2, task 4)', () => {
  // A verified JWT with no usable user_role claim means the Supabase
  // custom_access_token hook did not run or is misconfigured. Today that
  // silently grants Supervisor. These cases fence the log line that lets the
  // real-world rate be MEASURED before the default is changed to fail closed —
  // failing closed on an unmeasured hook is an outage you chose.
  function spyWarn() {
    return vi.spyOn(console, 'warn').mockImplementation(() => {});
  }

  it('warns when the role header is absent', () => {
    const spy = spyWarn();
    getSessionUserFromHeaders(new Headers({ 'x-siteops-user-id': 'u_9' }));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]?.[0])).toContain('auth_role_claim_missing');
    expect(String(spy.mock.calls[0]?.[0])).toContain('u_9');
    spy.mockRestore();
  });

  it('warns when the role header is an unknown value', () => {
    const spy = spyWarn();
    getSessionUserFromHeaders(
      new Headers({ 'x-siteops-user-id': 'u_9', 'x-siteops-user-role': 'Wizard' }),
    );

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('stays silent on the common path, where the claim is present and valid', () => {
    const spy = spyWarn();
    getSessionUserFromHeaders(
      new Headers({ 'x-siteops-user-id': 'u_9', 'x-siteops-user-role': 'Admin' }),
    );

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('stays silent when there is no session at all, which is not a hook failure', () => {
    const spy = spyWarn();
    getSessionUserFromHeaders(new Headers());

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('still returns Supervisor — this task instruments, it does not fail closed yet', () => {
    const spy = spyWarn();
    expect(
      getSessionUserFromHeaders(new Headers({ 'x-siteops-user-id': 'u_9' }))?.role,
    ).toBe('Supervisor');
    spy.mockRestore();
  });
});
