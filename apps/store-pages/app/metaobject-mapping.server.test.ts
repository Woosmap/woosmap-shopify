import { describe, it, expect } from 'vitest';
import { buildLocalPage, type LocalPage, type LocalPageEnrichment } from '@woosmap/local-page-engine';
import type { Store } from '@woosmap/store-search-client';
import { localPageToMetaobjectFields, STORE_METAOBJECT_TYPE } from './metaobject-mapping.server';

const STORE: Store = {
  storeId: 'f52b6ee0_4734_4e36_8929_95fb2304aa4b',
  name: 'Store 1',
  lat: 48.8566,
  lng: 2.3522,
  address1: '1 rue de Rivoli',
  address2: 'Bâtiment B',
  city: 'Paris',
  zip: '75001',
  countryCode: 'FR',
  phone: '+33123456789',
  email: 'store@example.com',
  website: 'https://example.com/store-1',
  openingHours: { timezone: 'Europe/Paris', days: {} as never },
  types: ['Shop'],
  tags: ['CC'],
  lastUpdated: '2026-08-01T00:00:00Z',
  userProperties: null,
};

function page(store: Store = STORE, enrichment: LocalPageEnrichment = {}): LocalPage {
  return buildLocalPage(store, enrichment, {}, { now: '2026-08-14T00:00:00.000Z' });
}

function byKey(fields: Array<{ key: string; value: string }>): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, f.value]));
}

describe('localPageToMetaobjectFields — store facts', () => {
  it('flattens the store onto the metaobject keys', () => {
    const fields = byKey(localPageToMetaobjectFields(page()));
    expect(fields).toMatchObject({
      store_id: 'f52b6ee0_4734_4e36_8929_95fb2304aa4b',
      name: 'Store 1',
      address1: '1 rue de Rivoli',
      address2: 'Bâtiment B',
      city: 'Paris',
      zip: '75001',
      country_code: 'FR',
      phone: '+33123456789',
      email: 'store@example.com',
      website: 'https://example.com/store-1',
    });
  });

  it('stringifies the coordinates for number_decimal fields', () => {
    const fields = byKey(localPageToMetaobjectFields(page()));
    expect([fields['lat'], fields['lng']]).toEqual(['48.8566', '2.3522']);
  });

  it('JSON-encodes the opening hours', () => {
    const fields = byKey(localPageToMetaobjectFields(page()));
    expect(JSON.parse(fields['hours']!).timezone).toBe('Europe/Paris');
  });

  it('JSON-encodes the list fields', () => {
    const fields = byKey(localPageToMetaobjectFields(page()));
    expect([fields['types'], fields['tags']]).toEqual(['["Shop"]', '["CC"]']);
  });

  it('omits coordinates and hours when the store has none', () => {
    const fields = byKey(
      localPageToMetaobjectFields(page({ ...STORE, lat: null, lng: null, openingHours: null })),
    );
    expect(['lat', 'lng', 'hours'].filter((k) => k in fields)).toEqual([]);
  });

  it('omits empty list fields rather than sending "[]"', () => {
    const fields = byKey(localPageToMetaobjectFields(page({ ...STORE, types: [], tags: [] })));
    expect(['types', 'tags'].filter((k) => k in fields)).toEqual([]);
  });

  it('never writes description — the merchant owns the prose', () => {
    const keys = localPageToMetaobjectFields(page()).map((f) => f.key);
    expect(keys).not.toContain('description');
  });
});

describe('localPageToMetaobjectFields — enrichment', () => {
  it('emits the admin levels the page carries', () => {
    const fields = byKey(
      localPageToMetaobjectFields(
        page(STORE, { admin: { country: 'France', region: 'Île-de-France', county: 'Paris' } }),
      ),
    );
    expect(fields).toMatchObject({ country: 'France', region: 'Île-de-France', county: 'Paris' });
  });

  it('never writes city from the admin data — it comes from the store facts', () => {
    const fields = byKey(
      localPageToMetaobjectFields(page({ ...STORE, city: '' }, { admin: { city: 'Bordeaux' } })),
    );
    expect(fields['city']).toBeUndefined();
  });

  it('omits whitespace-only admin levels', () => {
    const fields = byKey(localPageToMetaobjectFields(page(STORE, { admin: { region: '   ' } })));
    expect(fields['region']).toBeUndefined();
  });

  it('JSON-encodes the nearby payload', () => {
    const fields = byKey(
      localPageToMetaobjectFields(page(STORE, { nearby: { updated_at: 'T', groups: [] } })),
    );
    expect(fields['nearby']).toBe('{"updated_at":"T","groups":[]}');
  });

  it('omits nearby entirely when the page was not enriched, so the stored value survives', () => {
    const fields = byKey(localPageToMetaobjectFields(page()));
    expect('nearby' in fields).toBe(false);
  });

  it('JSON-encodes the neighbouring stores', () => {
    const neighbours = [{ handle: 'h', url: '/u', name: 'N', city: 'Paris', km: 2 }];
    const fields = byKey(localPageToMetaobjectFields(page(STORE, { nearbyStores: neighbours })));
    expect(JSON.parse(fields['nearby_stores']!)).toEqual(neighbours);
  });

  it('writes "[]" when the search ran and found none, so stale neighbours are cleared', () => {
    // Not a no-op: omitting the key would leave yesterday's list in the metaobject and
    // `store.liquid` would keep rendering links to it.
    const fields = byKey(localPageToMetaobjectFields(page(STORE, { nearbyStores: [] })));
    expect(fields['nearby_stores']).toBe('[]');
  });

  it('omits nearby_stores when the search never ran, so the stored value survives', () => {
    const fields = byKey(localPageToMetaobjectFields(page()));
    expect('nearby_stores' in fields).toBe(false);
  });
});

describe('STORE_METAOBJECT_TYPE', () => {
  it('is the merchant-owned `store` type, with no $app: prefix', () => {
    expect(STORE_METAOBJECT_TYPE).toBe('store');
  });
});
