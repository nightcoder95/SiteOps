import { describe, expect, it } from 'vitest';
import { checkOwnership } from './ownership';

describe('checkOwnership', () => {
  it('returns true for Admin role', () => {
    const user = { id: 'u1', role: 'Admin' };
    expect(checkOwnership(user, 'other-user-id')).toBe(true);
  });

  it('returns true when user owns the resource', () => {
    const user = { id: 'u1', role: 'Supervisor' };
    expect(checkOwnership(user, 'u1')).toBe(true);
  });

  it('returns false when user does not own the resource and is not Admin', () => {
    const user = { id: 'u1', role: 'Supervisor' };
    expect(checkOwnership(user, 'u2')).toBe(false);
  });

  it('handles null ownerId gracefully', () => {
    const user = { id: 'u1', role: 'Supervisor' };
    expect(checkOwnership(user, null)).toBe(false);
  });
});
