import { describe, it, expect } from 'vitest';
import type { Store } from '@woosmap/store-search-client';
import { buildStoreIndex, findNearbyStores, haversineKm } from '../../src/enrich/neighbours';

function store(partial: Partial<Store> & { storeId: string }): Store {
  return {
    storeId: partial.storeId,
    name: partial.name ?? `Store ${partial.storeId}`,
    lat: partial.lat ?? null,
    lng: partial.lng ?? null,
    address1: '',
    address2: '',
    city: partial.city ?? '',
    zip: '',
    countryCode: '',
    phone: '',
    email: '',
    website: '',
    openingHours: null,
    types: [],
    tags: [],
    lastUpdated: null,
    userProperties: null,
  };
}

describe('haversineKm', () => {
  it('is ~0 for the same point', () => {
    expect(haversineKm(51.5, -0.1, 51.5, -0.1)).toBeCloseTo(0, 5);
  });

  it('matches a known distance (London ↔ Paris ≈ 343 km)', () => {
    const d = haversineKm(51.5074, -0.1278, 48.8566, 2.3522);
    expect(d).toBeGreaterThan(330);
    expect(d).toBeLessThan(355);
  });
});

describe('buildStoreIndex', () => {
  it('keeps stores with coordinates and a name, drops the rest', () => {
    const index = buildStoreIndex([
      store({ storeId: 'a', name: 'A', lat: 51, lng: 0, city: 'London' }),
      store({ storeId: 'b', name: 'B', lat: null, lng: 0 }), // no coordinates
      store({ storeId: 'c', name: '', lat: 51, lng: 0 }), // no name
    ]);
    expect(index.map((e) => e.handle)).toEqual(['a']);
    expect(index[0]).toMatchObject({ handle: 'a', name: 'A', city: 'London', lat: 51, lng: 0 });
  });
});

describe('findNearbyStores', () => {
  // A cluster around Spalding (52.787, -0.157) plus a couple out of range.
  const self = store({ storeId: '2408', name: 'Spalding RP', lat: 52.787169, lng: -0.157254, city: 'Spalding' });
  const near1 = store({ storeId: 'n1', name: 'Store One', lat: 52.79, lng: -0.15, city: 'Spalding' }); // ~0.6 km
  const near2 = store({ storeId: 'n2', name: 'Store Two', lat: 52.83, lng: -0.16, city: 'Pinchbeck' }); // ~4.8 km
  const near3 = store({ storeId: 'n3', name: 'Store Three', lat: 52.72, lng: -0.2, city: 'Cowbit' }); // ~8 km
  const near4 = store({ storeId: 'n4', name: 'Store Four', lat: 52.68, lng: -0.05, city: 'Crowland' }); // ~14 km (out)
  const far = store({ storeId: 'far', name: 'Far Away', lat: 48.85, lng: 2.35, city: 'Paris' });

  const index = buildStoreIndex([self, near1, near2, near3, near4, far]);

  it('returns the nearest N others within the radius, sorted, excluding self', () => {
    const out = findNearbyStores(self, index, { radiusKm: 10, limit: 3 });
    expect(out.map((s) => s.handle)).toEqual(['n1', 'n2', 'n3']);
    expect(out.map((s) => s.name)).toEqual(['Store One', 'Store Two', 'Store Three']);
    // sorted by exact distance (ceil is monotonic, so ties stay ordered)
    expect(out[0]!.km).toBeLessThanOrEqual(out[1]!.km);
    expect(out[1]!.km).toBeLessThanOrEqual(out[2]!.km);
    // straight-line distance rounded UP to whole km
    expect(out.every((s) => Number.isInteger(s.km))).toBe(true);
    expect(out[0]!.km).toBe(1); // nearest neighbour ~0.6 km → 1
  });

  it('builds the flat page URL from the handle + url base, and carries the city', () => {
    const out = findNearbyStores(self, index, { radiusKm: 10, limit: 3, urlBase: '/pages/stores' });
    expect(out[0]!.url).toBe('/pages/stores/n1');
    expect(out[0]!.city).toBe('Spalding');
  });

  it('honours the limit', () => {
    expect(findNearbyStores(self, index, { radiusKm: 10, limit: 1 })).toHaveLength(1);
  });

  it('excludes stores beyond the radius', () => {
    const handles = findNearbyStores(self, index, { radiusKm: 10, limit: 10 }).map((s) => s.handle);
    expect(handles).not.toContain('n4'); // ~14 km
    expect(handles).not.toContain('far');
    expect(handles).not.toContain('2408'); // never lists itself
  });

  it('returns [] when the store has no coordinates', () => {
    const noCoords = store({ storeId: 'x', name: 'X', lat: null, lng: null });
    expect(findNearbyStores(noCoords, index)).toEqual([]);
  });
});
