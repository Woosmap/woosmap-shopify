import { describe, it, expect, vi } from 'vitest';
import type { Store, StoreFeature, StoresSearchRequest } from '@woosmap/store-search-client';
import { buildSyncQuery, syncStores, type MetaobjectUpserter } from './store-sync.server';

function feature(id: string, name = id, coords: [number, number] = [2.3, 48.8]): StoreFeature {
  return {
    type: 'Feature',
    properties: { store_id: id, name, address: { city: 'Paris', zipcode: '75001', country_code: 'fr' } },
    geometry: { type: 'Point', coordinates: coords },
  };
}

/** A fake StoreSource that records the request it was iterated with. */
function source(features: StoreFeature[]) {
  const calls: (StoresSearchRequest | undefined)[] = [];
  return {
    calls,
    iterateStores(request?: StoresSearchRequest): AsyncIterable<StoreFeature> {
      calls.push(request);
      return (async function* () {
        for (const f of features) {
          yield f;
        }
      })();
    },
  };
}

describe('buildSyncQuery', () => {
  it('returns undefined for a full sync (no options)', () => {
    expect(buildSyncQuery()).toBeUndefined();
  });

  it('builds an incremental last_updated clause from `since`', () => {
    expect(buildSyncQuery({ since: '2026-07-01T00:00:00' })).toBe('last_updated:>="2026-07-01T00:00:00"');
  });

  it('AND-combines `since` with an extra query clause', () => {
    expect(buildSyncQuery({ since: '2026-07-01T00:00:00', query: 'type:"shop"' })).toBe(
      'last_updated:>="2026-07-01T00:00:00" AND type:"shop"',
    );
  });
});

describe('syncStores', () => {
  it('upserts every store with a stable handle and reports a summary', async () => {
    const src = source([feature('store_A'), feature('store_B')]);
    const upsert = vi.fn<MetaobjectUpserter>(async ({ handle }) => ({ id: `gid://${handle}`, handle }));

    const result = await syncStores({ source: src, upsert });

    expect(result).toEqual({ total: 2, upserted: 2, skipped: 0, failed: 0, errors: [] });
    expect(upsert).toHaveBeenCalledTimes(2);
    const handles = upsert.mock.calls.map((c) => c[0].handle);
    expect(handles).toEqual(['store_a', 'store_b']);
    // The mapped fields carry the flattened store data.
    const firstFields = Object.fromEntries(upsert.mock.calls[0]![0].fields.map((f) => [f.key, f.value]));
    expect(firstFields['store_id']).toBe('store_A');
    expect(firstFields['city']).toBe('Paris');
    expect(firstFields['lat']).toBe('48.8');
  });

  it('carries enrich() onto the page; an enrich error never aborts the store', async () => {
    const src = source([feature('store_A'), feature('store_B')]);
    const upsert = vi.fn<MetaobjectUpserter>(async ({ handle }) => ({ id: `gid://${handle}`, handle }));
    const enrich = vi.fn(async (store: Store) => {
      if (store.storeId === 'store_B') throw new Error('boom');
      return { nearby: { updated_at: 't', groups: [] } };
    });

    const result = await syncStores({ source: src, upsert, enrich });

    expect(result.upserted).toBe(2); // both stores upserted, even though enrich threw on B
    const aFields = Object.fromEntries(upsert.mock.calls[0]![0].fields.map((f) => [f.key, f.value]));
    expect(aFields['nearby']).toBe('{"updated_at":"t","groups":[]}');
    const bFields = Object.fromEntries(upsert.mock.calls[1]![0].fields.map((f) => [f.key, f.value]));
    expect(bFields['nearby']).toBeUndefined(); // enrich threw → no key, base upsert still ran
  });

  it('emits the admin levels an enricher resolved', async () => {
    const src = source([feature('store_A')]);
    const upsert = vi.fn<MetaobjectUpserter>(async ({ handle }) => ({ id: `gid://${handle}`, handle }));
    const enrich = async (): Promise<{ admin: { region: string; county: string } }> => ({
      admin: { region: 'Île-de-France', county: 'Paris' },
    });

    await syncStores({ source: src, upsert, enrich });

    const fields = Object.fromEntries(upsert.mock.calls[0]![0].fields.map((f) => [f.key, f.value]));
    expect([fields['region'], fields['county']]).toEqual(['Île-de-France', 'Paris']);
  });

  it('uses the injected clock so a run is reproducible', async () => {
    const src = source([feature('store_A')]);
    const upsert = vi.fn<MetaobjectUpserter>(async ({ handle }) => ({ id: `gid://${handle}`, handle }));
    const now = vi.fn(() => '2026-08-14T00:00:00.000Z');

    await syncStores({ source: src, upsert, now });

    expect(now).toHaveBeenCalled();
  });

  it('passes a full-sync request (undefined) when no options are given', async () => {
    const src = source([]);
    await syncStores({ source: src, upsert: vi.fn() });
    expect(src.calls[0]).toBeUndefined();
  });

  it('passes an incremental query request when `since` is set', async () => {
    const src = source([]);
    await syncStores({ source: src, upsert: vi.fn() }, { since: '2026-07-01T00:00:00' });
    expect(src.calls[0]).toEqual({ query: 'last_updated:>="2026-07-01T00:00:00"' });
  });

  it('skips a store with no id or no name without calling upsert', async () => {
    const noId = { ...feature(''), properties: { store_id: '', name: 'x' } } as StoreFeature;
    const noName = { ...feature('s'), properties: { store_id: 's', name: '' } } as StoreFeature;
    const upsert = vi.fn<MetaobjectUpserter>();

    const result = await syncStores({ source: source([noId, noName]), upsert });

    expect(result.skipped).toBe(2);
    expect(result.upserted).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('collects a per-store failure and keeps going (partial success)', async () => {
    const upsert = vi.fn<MetaobjectUpserter>(async ({ handle }) => {
      if (handle === 'bad') {
        throw new Error('boom');
      }
      return { id: handle, handle };
    });

    const result = await syncStores({ source: source([feature('good'), feature('bad'), feature('good2')]), upsert });

    expect(result.total).toBe(3);
    expect(result.upserted).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual([{ storeId: 'bad', message: 'boom' }]);
  });

  it('coerces a non-Error throw into a string message', async () => {
    const upsert = vi.fn<MetaobjectUpserter>(async () => {
      throw 'string failure';
    });
    const result = await syncStores({ source: source([feature('s')]), upsert });
    expect(result.errors[0]!.message).toBe('string failure');
  });

  it('emits progress events for upserted, skipped, and failed stores', async () => {
    const onProgress = vi.fn();
    const noName = { ...feature('n'), properties: { store_id: 'n', name: '' } } as StoreFeature;
    const upsert = vi.fn<MetaobjectUpserter>(async ({ handle }) => {
      if (handle === 'bad') throw new Error('x');
      return { id: handle, handle };
    });

    await syncStores({ source: source([feature('ok'), feature('bad'), noName]), upsert, onProgress });

    const statuses = onProgress.mock.calls.map((c) => c[0].status);
    expect(statuses).toEqual(['upserted', 'failed', 'skipped']);
  });
});
