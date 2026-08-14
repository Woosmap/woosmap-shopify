import { describe, it, expect } from 'vitest';
import type { FetchLike } from '../../src/enrich/transport';
import { hasAdmin, reverseGeocode } from '../../src/enrich/admin';

function ok(body: unknown): ReturnType<FetchLike> {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

describe('reverseGeocode', () => {
  const components = [
    { types: ['country'], long_name: 'France' },
    { types: ['state', 'division_level_1'], long_name: 'Nouvelle-Aquitaine' },
    { types: ['administrative_area_level_1', 'county'], long_name: 'Gironde' },
    { types: ['locality'], long_name: 'Bordeaux' },
    { types: ['postal_codes'], long_name: '33000' },
  ];

  it('maps Woosmap component types to admin levels', async () => {
    const fetchImpl: FetchLike = () => ok({ results: [{ address_components: components }] });
    const areas = await reverseGeocode(fetchImpl, 'pk', 44.83, -0.57);
    expect(areas).toEqual({ country: 'France', region: 'Nouvelle-Aquitaine', county: 'Gironde', city: 'Bordeaux' });
  });

  it('returns null on a non-ok response', async () => {
    const bad: FetchLike = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    expect(await reverseGeocode(bad, 'pk', 1, 1)).toBeNull();
  });

  it('returns null on empty results', async () => {
    const empty: FetchLike = () => ok({ results: [] });
    expect(await reverseGeocode(empty, 'pk', 1, 1)).toBeNull();
  });

  it('takes the first value when a component name is an array', async () => {
    const fetchImpl: FetchLike = () =>
      ok({ results: [{ address_components: [{ types: ['locality'], long_name: ['Lille', 'Lisle'] }] }] });
    const areas = await reverseGeocode(fetchImpl, 'pk', 1, 1);
    expect(areas?.city).toBe('Lille');
  });

  it('sends latlng and private_key', async () => {
    let calledUrl = '';
    const fetchImpl: FetchLike = (url) => {
      calledUrl = url;
      return ok({ results: [{ address_components: components }] });
    };
    await reverseGeocode(fetchImpl, 'secret', 51.38, 0.52);
    const p = new URL(calledUrl).searchParams;
    expect(p.get('latlng')).toBe('51.38,0.52');
    expect(p.get('private_key')).toBe('secret');
  });

  it('honours an api base override', async () => {
    let calledUrl = '';
    const fetchImpl: FetchLike = (url) => {
      calledUrl = url;
      return ok({ results: [{ address_components: components }] });
    };
    await reverseGeocode(fetchImpl, 'k', 1, 1, 'https://eu.example.com');
    expect(calledUrl.startsWith('https://eu.example.com/')).toBe(true);
  });
});

describe('hasAdmin', () => {
  it('is true on a region alone', () => {
    expect(hasAdmin({ region: 'Kent' })).toBe(true);
  });

  it('is true on a city alone', () => {
    expect(hasAdmin({ city: 'Chatham' })).toBe(true);
  });

  it('is false for null', () => {
    expect(hasAdmin(null)).toBe(false);
  });

  it('is false for an empty object', () => {
    expect(hasAdmin({})).toBe(false);
  });
});
