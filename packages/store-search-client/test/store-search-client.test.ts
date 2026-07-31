import { describe, it, expect, vi } from 'vitest';
import { StoreSearchClient } from '../src/store-search-client';
import { WoosmapApiError, WoosmapRequestError } from '../src/errors';
import type { Transport, TransportResponse } from '../src/transport';
import type { StoreFeature, StoresSearchResponse } from '../src/types';

function ok(body: unknown): TransportResponse {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body };
}

function feature(id: string): StoreFeature {
  return {
    type: 'Feature',
    properties: { store_id: id, name: id },
    geometry: { type: 'Point', coordinates: [0, 0] },
  };
}

function page(features: StoreFeature[], pageNo: number, pageCount: number): StoresSearchResponse {
  return { type: 'FeatureCollection', features, pagination: { page: pageNo, pageCount } };
}

describe('StoreSearchClient construction', () => {
  it('throws when neither a public nor a private key is provided', () => {
    expect(() => new StoreSearchClient()).toThrow(WoosmapRequestError);
  });

  it('accepts a public key alone', () => {
    expect(() => new StoreSearchClient({ key: 'woos-public' })).not.toThrow();
  });
});

describe('search', () => {
  it('hits /stores/search with encoded params and no auth header for a public key', async () => {
    const transport = vi.fn<Transport>().mockResolvedValue(ok(page([feature('a')], 1, 1)));
    const client = new StoreSearchClient({ key: 'woos-public', transport });
    const res = await client.search({ query: 'type:"grocery"', latLng: { lat: 1, lng: 2 } });

    expect(res.features).toHaveLength(1);
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toContain('https://api.woosmap.com/stores/search?');
    expect(url).toContain('lat=1');
    expect(url).toContain('lng=2');
    // Public key with no referer → no auth headers sent.
    expect(init?.headers).toBeUndefined();
  });

  it('sends X-Api-Key for a private key and Referer when configured', async () => {
    const transport = vi.fn<Transport>().mockResolvedValue(ok(page([], 1, 1)));
    const client = new StoreSearchClient({
      privateKey: 'woos-private',
      referer: 'https://shop.example',
      transport,
    });
    await client.search();
    const init = transport.mock.calls[0]![1];
    expect(init?.headers).toEqual({ 'X-Api-Key': 'woos-private', Referer: 'https://shop.example' });
  });

  it('throws WoosmapApiError carrying status and parsed body on a non-2xx', async () => {
    const transport = vi.fn<Transport>().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ error: 'referer' }),
    });
    const client = new StoreSearchClient({ key: 'k', transport });
    await expect(client.search()).rejects.toMatchObject({
      name: 'WoosmapApiError',
      status: 403,
      body: { error: 'referer' },
    });
  });

  it('tolerates a non-JSON error body', async () => {
    const transport = vi.fn<Transport>().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => {
        throw new Error('not json');
      },
    });
    const client = new StoreSearchClient({ key: 'k', transport });
    await expect(client.search()).rejects.toBeInstanceOf(WoosmapApiError);
  });
});

describe('autocomplete / getStoreById / getBounds', () => {
  it('autocomplete hits /stores/autocomplete', async () => {
    const transport = vi.fn<Transport>().mockResolvedValue(ok({ predictions: [] }));
    const client = new StoreSearchClient({ key: 'k', transport });
    await client.autocomplete({ query: 'name:"x"', limit: 5 });
    expect(transport.mock.calls[0]![0]).toContain('/stores/autocomplete?');
  });

  it('getStoreById encodes the id into the path and requires one', async () => {
    const transport = vi.fn<Transport>().mockResolvedValue(ok(feature('a b')));
    const client = new StoreSearchClient({ key: 'k', transport });
    await client.getStoreById('a b');
    expect(transport.mock.calls[0]![0]).toContain('/stores/a%20b');
    await expect(client.getStoreById('')).rejects.toBeInstanceOf(WoosmapRequestError);
  });

  it('getBounds hits /stores/search/bounds', async () => {
    const transport = vi.fn<Transport>().mockResolvedValue(ok({ bounds: [] }));
    const client = new StoreSearchClient({ key: 'k', transport });
    await client.getBounds({ latLng: { lat: 1, lng: 2 }, radius: 10 });
    expect(transport.mock.calls[0]![0]).toContain('/stores/search/bounds?');
  });
});

describe('iterateStores', () => {
  it('walks every page following pagination.pageCount', async () => {
    const transport = vi
      .fn<Transport>()
      .mockResolvedValueOnce(ok(page([feature('a'), feature('b')], 1, 3)))
      .mockResolvedValueOnce(ok(page([feature('c')], 2, 3)))
      .mockResolvedValueOnce(ok(page([feature('d')], 3, 3)));
    const client = new StoreSearchClient({ privateKey: 'k', transport });

    const ids: string[] = [];
    for await (const f of client.iterateStores({ query: 'type:"x"' })) {
      ids.push(f.properties.store_id);
    }
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
    expect(transport).toHaveBeenCalledTimes(3);
    // Iteration ignores a caller-supplied page and starts at 1.
    expect(transport.mock.calls[0]![0]).toContain('page=1');
  });

  it('stops after a single page when pageCount is 1', async () => {
    const transport = vi.fn<Transport>().mockResolvedValue(ok(page([feature('only')], 1, 1)));
    const client = new StoreSearchClient({ privateKey: 'k', transport });
    const ids: string[] = [];
    for await (const f of client.iterateStores()) {
      ids.push(f.properties.store_id);
    }
    expect(ids).toEqual(['only']);
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
