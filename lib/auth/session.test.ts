import { describe, expect, it } from 'vitest';

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
