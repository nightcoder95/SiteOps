import { describe, expect, it } from 'vitest';

import { requestJson } from '@/lib/http/client';

describe('requestJson', () => {
  it('marks a 404 endpoint as unavailable', async () => {
    const result = await requestJson('/api/sites', {}, async () => {
      return new Response('', { status: 404 });
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('endpoint_unavailable');
      expect(result.endpoint).toBe('/api/sites');
      expect(result.status).toBe(404);
    }
  });

  it('keeps a 404 api not-found response as an api_error', async () => {
    const result = await requestJson('/api/sites/does-not-exist', {}, async () => {
      return Response.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Site not found' },
      }, { status: 404 });
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('api_error');
      expect(result.message).toBe('Site not found');
    }
  });

  it('maps a failed api envelope to api_error', async () => {
    const result = await requestJson('/api/notifications', {}, async () => {
      return Response.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Bad request' },
      }, { status: 400 });
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('api_error');
      expect(result.message).toBe('Bad request');
    }
  });

  it('marks thrown fetch failures as network_error', async () => {
    const result = await requestJson('/api/profile', {}, async () => {
      throw new TypeError('fetch failed');
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('network_error');
      expect(result.endpoint).toBe('/api/profile');
    }
  });
});
