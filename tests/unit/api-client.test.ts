import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/shared/api/client';

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports HTML responses with request and response context', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!DOCTYPE html><html><body>Proxy Error</body></html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
      ),
    );

    const result = await apiRequest('/api/workflows');

    expect(result).toMatchObject({
      success: false,
      status: 502,
    });
    expect(result.error).toContain('非 JSON 响应');
    expect(result.error).toContain('HTTP 502');
    expect(result.error).toContain('/api/workflows');
    expect(result.error).toContain('text/html');
    expect(result.error).toContain('Proxy Error');
    expect(result.error).not.toContain("Unexpected token '<'");
  });

  it('reports non-JSON bodies even when the HTTP status is successful', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!DOCTYPE html><html><body>Application shell</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );

    const result = await apiRequest('/api/status');

    expect(result.success).toBe(false);
    expect(result.status).toBe(200);
    expect(result.error).toContain('Application shell');
  });
});
