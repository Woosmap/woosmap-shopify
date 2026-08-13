import { describe, it, expect } from 'vitest';
import type { FetchLike } from './nearby-enrich.server';
import { buildAdminFields, hasAdmin, reverseGeocode } from './admin-enrich.server';

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

  it('returns null on a non-ok response or empty results', async () => {
    const bad: FetchLike = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    expect(await reverseGeocode(bad, 'pk', 1, 1)).toBeNull();
    const empty: FetchLike = () => ok({ results: [] });
    expect(await reverseGeocode(empty, 'pk', 1, 1)).toBeNull();
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
});

describe('buildAdminFields', () => {
  it('emits the country/region/county values, omitting empty levels', () => {
    const fields = buildAdminFields({ country: 'France', region: 'Nouvelle-Aquitaine', county: 'Gironde', city: 'Bordeaux' });
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));
    expect(byKey).toEqual({ country: 'France', region: 'Nouvelle-Aquitaine', county: 'Gironde' });
    expect(byKey).not.toHaveProperty('city'); // city itself comes from the base sync
    expect(byKey).not.toHaveProperty('region_slug'); // slugs are no longer stored
  });

  it('omits levels that are absent', () => {
    const fields = buildAdminFields({ region: 'England', county: 'Kent' });
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));
    expect(byKey).toEqual({ region: 'England', county: 'Kent' });
  });
});

describe('hasAdmin', () => {
  it('is true when at least one level is present', () => {
    expect(hasAdmin({ region: 'Kent' })).toBe(true);
    expect(hasAdmin({ city: 'Chatham' })).toBe(true);
  });
  it('is false for null or an empty object', () => {
    expect(hasAdmin(null)).toBe(false);
    expect(hasAdmin({})).toBe(false);
  });
});
