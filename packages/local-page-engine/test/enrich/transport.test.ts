import { describe, it, expect } from 'vitest';
import { toTransport, type FetchLike } from '../../src/enrich/transport';

/** Response-like whose `json` needs its receiver, like a real Response under undici. */
function responseLike(body: unknown, init: { ok: boolean; status: number }) {
  return {
    ok: init.ok,
    status: init.status,
    marker: true,
    json(): Promise<unknown> {
      const self = this as { marker?: boolean } | undefined;
      if (self?.marker !== true) {
        throw new TypeError('Illegal invocation');
      }
      return Promise.resolve(body);
    },
  };
}

describe('toTransport', () => {
  it('keeps `json` attached to its Response', async () => {
    const fetchImpl: FetchLike = () =>
      Promise.resolve(responseLike({ results: [] }, { ok: true, status: 200 }));
    const response = await toTransport(fetchImpl)('https://api.woosmap.com/x');
    await expect(response.json()).resolves.toEqual({ results: [] });
  });

  it('forwards the real status', async () => {
    const unauthorised: FetchLike = () => Promise.resolve(responseLike({}, { ok: false, status: 401 }));
    expect((await toTransport(unauthorised)('https://api.woosmap.com/x')).status).toBe(401);
  });

  it('falls back to 200 and 502 without a status', async () => {
    const ok: FetchLike = () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    const failed: FetchLike = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    expect((await toTransport(ok)('u')).status).toBe(200);
    expect((await toTransport(failed)('u')).status).toBe(502);
  });
});
