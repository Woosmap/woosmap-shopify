import { describe, it, expect } from 'vitest';
import {
  DEFAULT_NEARBY_GROUPS,
  addDistances,
  enrichNearby,
  fetchNearbyGroup,
  isNearbyStale,
  parseNearbyGroups,
  type FetchLike,
  type NearbyPoi,
} from './nearby-enrich.server';

/** A resolved fetch-like response carrying `body` as JSON. */
function ok(body: unknown): ReturnType<FetchLike> {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

const transitGroup = DEFAULT_NEARBY_GROUPS.find((g) => g.key === 'transit')!;

describe('isNearbyStale', () => {
  const now = new Date('2026-08-12T00:00:00Z');

  it('is stale when the timestamp is missing or unparseable', () => {
    expect(isNearbyStale(undefined, 30, now)).toBe(true);
    expect(isNearbyStale(null, 30, now)).toBe(true);
    expect(isNearbyStale('not-a-date', 30, now)).toBe(true);
  });

  it('is fresh within the TTL and stale beyond it', () => {
    expect(isNearbyStale('2026-08-01T00:00:00Z', 30, now)).toBe(false); // 11 days old
    expect(isNearbyStale('2026-06-01T00:00:00Z', 30, now)).toBe(true); // > 30 days old
  });
});

describe('fetchNearbyGroup', () => {
  it('keeps only allowed categories (metro/train) and caps at max', async () => {
    const fetchImpl: FetchLike = () =>
      ok({
        results: [
          { name: 'Metro A', categories: ['transit.station.rail.subway'], geometry: { location: { lat: 1, lng: 2 } } },
          { name: 'Bus B', categories: ['transit.station.bus'], geometry: { location: { lat: 1, lng: 2 } } },
          { name: 'Train C', categories: ['transit.station.rail.train'], geometry: { location: { lat: 3, lng: 4 } } },
          { name: 'Metro D', categories: ['transit.station.rail.subway'], geometry: { location: { lat: 5, lng: 6 } } },
          { name: 'Metro E', categories: ['transit.station.rail.subway'], geometry: { location: { lat: 7, lng: 8 } } },
        ],
      });
    const items = await fetchNearbyGroup(fetchImpl, 'pk', 48, 2, transitGroup);
    expect(items.map((i) => i.name)).toEqual(['Metro A', 'Train C', 'Metro D']); // bus dropped, capped at 3
  });

  it('returns [] on a non-ok response', async () => {
    const fetchImpl: FetchLike = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    expect(await fetchNearbyGroup(fetchImpl, 'pk', 1, 1, transitGroup)).toEqual([]);
  });

  it('drops results without a name or coordinates', async () => {
    const fetchImpl: FetchLike = () =>
      ok({ results: [{ categories: ['business.fuel'], geometry: { location: { lat: 1, lng: 2 } } }] });
    const fuel = DEFAULT_NEARBY_GROUPS.find((g) => g.key === 'fuel')!;
    expect(await fetchNearbyGroup(fetchImpl, 'pk', 1, 1, fuel)).toEqual([]);
  });
});

describe('addDistances', () => {
  it('maps matrix elements onto POIs in order, skips non-OK, and uses the given mode', async () => {
    const pois: NearbyPoi[] = [
      { name: 'A', lat: 1, lng: 1, category: 'x' },
      { name: 'B', lat: 2, lng: 2, category: 'y' },
    ];
    let calledUrl = '';
    const fetchImpl: FetchLike = (url) => {
      calledUrl = url;
      return ok({
        rows: [
          {
            elements: [
              { status: 'OK', distance: { text: '2.1 km' }, duration: { text: '5 mins' } },
              { status: 'ZERO_RESULTS' },
            ],
          },
        ],
      });
    };
    await addDistances(fetchImpl, 'pk', 0, 0, pois, 'driving');
    expect(calledUrl).toContain('mode=driving');
    expect(pois[0]).toMatchObject({ distance: '2.1 km', duration: '5 mins' });
    expect(pois[1]!.distance).toBeUndefined();
  });
});

describe('enrichNearby', () => {
  it('groups POIs, drops empty groups, adds walking distances and stamps updated_at', async () => {
    const fetchImpl: FetchLike = (url) => {
      if (url.includes('/localities/nearby/')) {
        if (url.includes('transit.station')) {
          return ok({ results: [{ name: 'Gare', categories: ['transit.station.rail.train'], geometry: { location: { lat: 1, lng: 2 } } }] });
        }
        if (url.includes('business.finance')) {
          return ok({ results: [{ name: 'Bank', categories: ['business.finance.bank'], geometry: { location: { lat: 3, lng: 4 } } }] });
        }
        return ok({ results: [] }); // fuel + food: empty
      }
      if (url.includes('/distance/distancematrix/json')) {
        // One matrix call per mode: transit → walking (Gare), cash → driving (Bank).
        if (url.includes('mode=walking')) {
          return ok({ rows: [{ elements: [{ status: 'OK', distance: { text: '300 m' }, duration: { text: '4 mins' } }] }] });
        }
        return ok({ rows: [{ elements: [{ status: 'OK', distance: { text: '1.2 km' }, duration: { text: '5 mins' } }] }] });
      }
      return ok({});
    };

    const data = await enrichNearby(fetchImpl, 'pk', 48.8, 2.3, '2026-08-12T09:00:00Z');

    expect(data.updated_at).toBe('2026-08-12T09:00:00Z');
    expect(data.groups.map((g) => g.key)).toEqual(['transit', 'cash']); // fuel/food dropped
    expect(data.groups[0]).toMatchObject({ mode: 'walking' });
    expect(data.groups[1]).toMatchObject({ mode: 'driving' });
    expect(data.groups[0]!.items[0]).toMatchObject({ name: 'Gare', distance: '300 m', duration: '4 mins' }); // walking
    expect(data.groups[1]!.items[0]).toMatchObject({ name: 'Bank', distance: '1.2 km', duration: '5 mins' }); // driving
  });

  it('honours a custom `groups` argument (override)', async () => {
    const fetchImpl: FetchLike = (url) => {
      if (url.includes('/localities/nearby/')) {
        return ok({ results: [{ name: 'Pharmacy', geometry: { location: { lat: 48.9, lng: 2.4 } }, categories: ['business.health'] }] });
      }
      return ok({ rows: [{ elements: [{ status: 'OK', distance: { text: '200 m' }, duration: { text: '3 mins' } }] }] });
    };
    const groups = [{ key: 'health', title: 'Pharmacies', icon: 'health', types: 'business.health', radius: 1500, max: 2, mode: 'walking' as const }];
    const data = await enrichNearby(fetchImpl, 'pk', 48.8, 2.3, '2026-08-12T09:00:00Z', groups);
    expect(data.groups.map((g) => g.key)).toEqual(['health']);
    expect(data.groups[0]!.items[0]).toMatchObject({ name: 'Pharmacy', distance: '200 m' });
  });
});

describe('parseNearbyGroups', () => {
  it('returns the default set when absent or blank', () => {
    expect(parseNearbyGroups(undefined)).toBe(DEFAULT_NEARBY_GROUPS);
    expect(parseNearbyGroups('   ')).toBe(DEFAULT_NEARBY_GROUPS);
  });

  it('parses a valid override, keeping the optional filter', () => {
    const json = JSON.stringify([
      { key: 'transit', title: 'Transit', icon: 'transit', types: 'transit.station', radius: 800, max: 2, mode: 'walking', filter: ['transit.station.rail.train'] },
      { key: 'fuel', title: 'Fuel', icon: 'fuel', types: 'business.fuel', radius: 3000, max: 1, mode: 'driving' },
    ]);
    const groups = parseNearbyGroups(json);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ key: 'transit', title: 'Transit', icon: 'transit', types: 'transit.station', radius: 800, max: 2, mode: 'walking', filter: ['transit.station.rail.train'] });
    expect(groups[1]!.filter).toBeUndefined();
  });

  it('throws on invalid JSON, non-array, bad mode, missing field, or bad filter', () => {
    expect(() => parseNearbyGroups('{ oops')).toThrow(/not valid JSON/);
    expect(() => parseNearbyGroups('{}')).toThrow(/non-empty array/);
    expect(() => parseNearbyGroups('[]')).toThrow(/non-empty array/);
    expect(() => parseNearbyGroups(JSON.stringify([{ key: 'x', title: 't', icon: 'i', types: 'y', radius: 1, max: 1, mode: 'flying' }]))).toThrow(/mode must be/);
    expect(() => parseNearbyGroups(JSON.stringify([{ key: 'x', title: 't', icon: 'i', types: 'y', radius: 1, mode: 'walking' }]))).toThrow(/max must be a number/);
    expect(() => parseNearbyGroups(JSON.stringify([{ key: 'x', title: 't', icon: 'i', types: 'y', radius: 1, max: 1, mode: 'walking', filter: 'nope' }]))).toThrow(/filter must be an array/);
  });
});
