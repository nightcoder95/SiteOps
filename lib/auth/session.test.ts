import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getOrSetJson } = vi.hoisted(() => ({
  getOrSetJson: vi.fn(),
}));

vi.mock('@/lib/cache/getOrSetJson', () => ({
  getOrSetJson,
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      userProfiles: {
        findFirst: vi.fn(),
      },
    },
  },
}));

import { getSessionUserFromHeaders, safeGetSessionFromHeaders } from '@/lib/auth/session';

describe('getSessionUserFromHeaders', () => {
  beforeEach(() => {
    getOrSetJson.mockReset();
  });

  it('returns null when middleware has not injected user headers', async () => {
    await expect(getSessionUserFromHeaders(new Headers())).resolves.toBeNull();
    expect(getOrSetJson).not.toHaveBeenCalled();
  });

  it('uses forwarded role header when present', async () => {
    const headers = new Headers({
      'x-siteops-user-id': 'u_1',
      'x-siteops-user-email': 'admin@example.com',
      'x-siteops-user-role': 'Admin',
    });

    await expect(getSessionUserFromHeaders(headers)).resolves.toEqual({
      id: 'u_1',
      email: 'admin@example.com',
      role: 'Admin',
    });
    expect(getOrSetJson).not.toHaveBeenCalled();
  });

  it('falls back to cached profile role when role header is absent', async () => {
    getOrSetJson.mockResolvedValue({
      value: { role: 'Supervisor' },
      hit: false,
    });

    const headers = new Headers({
      'x-siteops-user-id': 'u_2',
      'x-siteops-user-email': 'supervisor@example.com',
    });

    await expect(getSessionUserFromHeaders(headers)).resolves.toEqual({
      id: 'u_2',
      email: 'supervisor@example.com',
      role: 'Supervisor',
    });
    expect(getOrSetJson).toHaveBeenCalledTimes(1);
  });
});

describe('safeGetSessionFromHeaders', () => {
  it('returns wrapped session user shape for guard compatibility', async () => {
    const headers = new Headers({
      'x-siteops-user-id': 'u_3',
      'x-siteops-user-email': 'u3@example.com',
      'x-siteops-user-role': 'Supervisor',
    });

    await expect(safeGetSessionFromHeaders(headers)).resolves.toEqual({
      user: {
        id: 'u_3',
        email: 'u3@example.com',
        role: 'Supervisor',
      },
    });
  });
});
