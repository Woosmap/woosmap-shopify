import { describe, it, expect, vi } from 'vitest';
import { DistanceClient, WoosmapApiError, WoosmapRequestError, type Transport } from '../src/index';

function okJson(body: unknown): ReturnType<Transport> {
  return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(body) });
}

const twoRow = { rows: [{ elements: [
  { status: 'OK', distance: { value: 2100, text: '2.1 km' }, duration: { value: 300, text: '5 mins' } },
  { status: 'ZERO_RESULTS' },
] }] };

describe('distanceMatrix', () => {
  it('builds the URL (origins, destinations, mode, elements, private_key) and parses the response', async () => {
    let called = '';
    const transport: Transport = (url) => { called = url; return okJson(twoRow); };
    const client = new DistanceClient({ privateKey: 'secret', transport });

    const res = await client.distanceMatrix({
      origins: [{ lat: 1, lng: 2 }],
      destinations: [{ lat: 3, lng: 4 }, { lat: 5, lng: 6 }],
      mode: 'walking',
    });

    expect(called).toContain('/distance/distancematrix/json?');
    expect(called).toContain('mode=walking');
    expect(called).toContain('elements=duration_distance'); // default; the value order the API expects
    expect(called).toContain('private_key=secret');
    // origins/destinations are encoded (comma → %2C, pipe → %7C)
    expect(called).toContain('origins=1%2C2');
    expect(called).toContain('destinations=3%2C4%7C5%2C6');
    expect(res.rows[0]!.elements).toHaveLength(2);
  });

  it('defaults mode to driving and uses a public key when given', async () => {
    let called = '';
    const transport: Transport = (url) => { called = url; return okJson({ rows: [] }); };
    await new DistanceClient({ key: 'pub', transport }).distanceMatrix({ origins: [{ lat: 0, lng: 0 }], destinations: [{ lat: 1, lng: 1 }] });
    expect(called).toContain('mode=driving');
    expect(called).toContain('key=pub');
    expect(called).not.toContain('private_key');
  });

  it('throws WoosmapRequestError when origins or destinations are empty', async () => {
    const client = new DistanceClient({ transport: () => okJson({ rows: [] }) });
    await expect(client.distanceMatrix({ origins: [], destinations: [{ lat: 1, lng: 1 }] })).rejects.toBeInstanceOf(WoosmapRequestError);
    await expect(client.distanceMatrix({ origins: [{ lat: 1, lng: 1 }], destinations: [] })).rejects.toBeInstanceOf(WoosmapRequestError);
  });

  it('throws WoosmapApiError on a non-2xx response', async () => {
    const transport: Transport = () => Promise.resolve({ ok: false, status: 403, statusText: 'Forbidden', json: () => Promise.resolve({ error: 'nope' }) });
    const client = new DistanceClient({ transport });
    await expect(client.distanceMatrix({ origins: [{ lat: 1, lng: 1 }], destinations: [{ lat: 2, lng: 2 }] })).rejects.toMatchObject({ name: 'WoosmapApiError', status: 403 });
  });
});

describe('travelTimes', () => {
  it('returns the first row elements, aligned with destinations', async () => {
    const transport = vi.fn<Transport>(() => okJson(twoRow));
    const client = new DistanceClient({ privateKey: 'pk', transport });
    const elements = await client.travelTimes({ lat: 1, lng: 1 }, [{ lat: 3, lng: 4 }, { lat: 5, lng: 6 }], 'walking');
    expect(elements).toHaveLength(2);
    expect(elements[0]).toMatchObject({ status: 'OK', distance: { text: '2.1 km' } });
    expect(elements[1]!.status).toBe('ZERO_RESULTS');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('returns [] and makes no call when there are no destinations', async () => {
    const transport = vi.fn<Transport>(() => okJson(twoRow));
    const out = await new DistanceClient({ transport }).travelTimes({ lat: 1, lng: 1 }, []);
    expect(out).toEqual([]);
    expect(transport).not.toHaveBeenCalled();
  });

  it('tolerates an empty rows array', async () => {
    const client = new DistanceClient({ transport: () => okJson({ rows: [] }) });
    expect(await client.travelTimes({ lat: 1, lng: 1 }, [{ lat: 2, lng: 2 }])).toEqual([]);
  });
});
