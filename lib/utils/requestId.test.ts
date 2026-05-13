import { describe, expect, it } from 'vitest';
import { generateRequestId } from './requestId';

describe('generateRequestId', () => {
  it('should return a string starting with req_', () => {
    const id = generateRequestId();
    expect(typeof id).toBe('string');
    expect(id.startsWith('req_')).toBe(true);
  });

  it('should return unique ids', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRequestId());
    }
    expect(ids.size).toBe(100);
  });
});
