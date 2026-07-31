import { describe, it, expect, vi, afterEach } from 'vitest';
import { defaultTransport } from '../src/transport';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('defaultTransport', () => {
  it('delegates to the global fetch', async () => {
    const fake = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fake as unknown as typeof fetch;
    await defaultTransport('https://api.woosmap.com/stores/search', { headers: { 'X-Api-Key': 'k' } });
    expect(fake).toHaveBeenCalledWith('https://api.woosmap.com/stores/search', {
      headers: { 'X-Api-Key': 'k' },
    });
  });

  it('throws a clear error when no global fetch exists', () => {
    // @ts-expect-error deliberately removing fetch for the test
    globalThis.fetch = undefined;
    expect(() => defaultTransport('https://api.woosmap.com')).toThrow(/No global fetch/);
  });
});
