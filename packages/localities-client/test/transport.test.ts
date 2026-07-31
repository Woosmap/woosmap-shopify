import { describe, it, expect, vi, afterEach } from 'vitest';
import { defaultTransport } from '../src/transport';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('defaultTransport', () => {
  it('delegates to the global fetch', async () => {
    const fake = { ok: true, status: 200, statusText: 'OK', json: async () => ({}) };
    const fetchSpy = vi.fn(async () => fake);
    vi.stubGlobal('fetch', fetchSpy);

    const result = await defaultTransport('https://example.test/x', { signal: undefined });

    expect(fetchSpy).toHaveBeenCalledWith('https://example.test/x', { signal: undefined });
    expect(result).toBe(fake);
  });

  it('throws a clear error when no global fetch exists', () => {
    vi.stubGlobal('fetch', undefined);
    expect(() => defaultTransport('https://example.test/x')).toThrow(/No global fetch/);
  });
});
