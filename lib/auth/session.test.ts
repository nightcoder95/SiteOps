import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createSupabaseServerClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

const { getOrSetJson } = vi.hoisted(() => ({
  getOrSetJson: vi.fn(),
}));

vi.mock('@/lib/auth/config', () => ({
  createSupabaseServerClient,
}));

vi.mock('@/lib/cache/getOrSetJson', () => ({
  getOrSetJson,
}));

vi.mock('@/lib/db/client', () => ({
  db: {},
}));

import { getSessionUser, safeGetSessionFromHeaders } from '@/lib/auth/session';

describe('getSessionUser', () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getOrSetJson.mockReset();
  });

  it('returns null when no authenticated user exists', async () => {
    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    });

    await expect(getSessionUser()).resolves.toBeNull();
    expect(getOrSetJson).not.toHaveBeenCalled();
  });

  it('returns profile role when session user exists', async () => {
    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: { id: 'u_1', email: 'admin@example.com' },
          },
        }),
      },
    });

    getOrSetJson.mockResolvedValue({
      value: { role: 'Admin' },
      hit: false,
    });

    await expect(getSessionUser()).resolves.toEqual({
      id: 'u_1',
      email: 'admin@example.com',
      role: 'Admin',
    });
  });

  it('defaults role to Supervisor when profile row is missing', async () => {
    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: { id: 'u_2', email: 'supervisor@example.com' },
          },
        }),
      },
    });

    getOrSetJson.mockResolvedValue({
      value: null,
      hit: false,
    });

    await expect(getSessionUser()).resolves.toEqual({
      id: 'u_2',
      email: 'supervisor@example.com',
      role: 'Supervisor',
    });
  });
});

describe('safeGetSessionFromHeaders', () => {
  it('returns wrapped session user shape for guard compatibility', async () => {
    createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: { id: 'u_3', email: 'u3@example.com' },
          },
        }),
      },
    });

    getOrSetJson.mockResolvedValue({
      value: { role: 'Supervisor' },
      hit: true,
    });

    await expect(safeGetSessionFromHeaders(new Headers())).resolves.toEqual({
      user: {
        id: 'u_3',
        email: 'u3@example.com',
        role: 'Supervisor',
      },
    });
  });
});
