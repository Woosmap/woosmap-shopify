import { describe, it, expect } from 'vitest';
import { featureToStore } from '../src/store';
import type { StoreFeature } from '../src/types';

/** A trimmed real `stores/search` feature (Paris car-wash dataset). */
const FIXTURE: StoreFeature = {
  type: 'Feature',
  properties: {
    store_id: 'f52b6ee0_4734_4e36_8929_95fb2304aa4b',
    name: 'PKG INDIGO LOUVRE SAMARITAINE',
    contact: { email: null, phone: null, website: 'https://example.com/wash' },
    address: {
      lines: ['1 PLACE DU LOUVRE', 'Bâtiment B'],
      country_code: 'fr',
      city: 'PARIS 1ER ARRONDISSEMENT',
      zipcode: '75001',
    },
    tags: ['CAR_WASH', 'VISA'],
    types: ['TWASH'],
    last_updated: '2026-02-19T07:55:57.497124+00:00',
    user_properties: { brand: 'TWASH' },
    weekly_opening: {
      timezone: 'Europe/Paris',
      '1': { hours: [{ start: '09:00', end: '17:00' }], isSpecial: false },
      '6': { hours: [], isSpecial: false },
    },
  },
  geometry: { type: 'Point', coordinates: [2.3406, 48.8595] },
};

describe('featureToStore', () => {
  it('flattens geometry, address, and contact into a flat Store', () => {
    const store = featureToStore(FIXTURE);
    expect(store.storeId).toBe('f52b6ee0_4734_4e36_8929_95fb2304aa4b');
    expect(store.name).toBe('PKG INDIGO LOUVRE SAMARITAINE');
    expect(store.lat).toBe(48.8595);
    expect(store.lng).toBe(2.3406);
    expect(store.address1).toBe('1 PLACE DU LOUVRE');
    expect(store.address2).toBe('Bâtiment B');
    expect(store.city).toBe('PARIS 1ER ARRONDISSEMENT');
    expect(store.zip).toBe('75001');
    expect(store.countryCode).toBe('FR');
    expect(store.website).toBe('https://example.com/wash');
    expect(store.phone).toBe('');
    expect(store.tags).toEqual(['CAR_WASH', 'VISA']);
    expect(store.lastUpdated).toBe('2026-02-19T07:55:57.497124+00:00');
    expect(store.userProperties).toEqual({ brand: 'TWASH' });
  });

  it('normalises weekly opening: filled and closed days, all seven keys present', () => {
    const store = featureToStore(FIXTURE);
    expect(store.openingHours?.timezone).toBe('Europe/Paris');
    expect(Object.keys(store.openingHours!.days)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(store.openingHours?.days['1']).toEqual([{ start: '09:00', end: '17:00' }]);
    expect(store.openingHours?.days['6']).toEqual([]);
    expect(store.openingHours?.days['7']).toEqual([]);
  });

  it('falls back to opening_hours.usual when weekly_opening is absent', () => {
    const feature: StoreFeature = {
      ...FIXTURE,
      properties: {
        store_id: 's2',
        name: 'S2',
        weekly_opening: undefined,
        opening_hours: {
          timezone: 'Europe/London',
          usual: { '2': [{ start: '08:00', end: '12:00' }] },
          special: {},
        },
      },
    };
    const store = featureToStore(feature);
    expect(store.openingHours?.timezone).toBe('Europe/London');
    expect(store.openingHours?.days['2']).toEqual([{ start: '08:00', end: '12:00' }]);
  });

  it('returns null openingHours when the store carries no hours at all', () => {
    const feature: StoreFeature = {
      ...FIXTURE,
      properties: { store_id: 's3', name: 'S3' },
    };
    expect(featureToStore(feature).openingHours).toBeNull();
  });

  it('defaults missing geometry, address, contact, tags, and types safely', () => {
    const feature = {
      type: 'Feature',
      properties: { store_id: 's4', name: 'S4' },
      geometry: undefined,
    } as unknown as StoreFeature;
    const store = featureToStore(feature);
    expect(store.lat).toBeNull();
    expect(store.lng).toBeNull();
    expect(store.address1).toBe('');
    expect(store.address2).toBe('');
    expect(store.countryCode).toBe('');
    expect(store.email).toBe('');
    expect(store.tags).toEqual([]);
    expect(store.types).toEqual([]);
    expect(store.userProperties).toBeNull();
  });
});
