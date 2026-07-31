import { describe, it, expect } from 'vitest';
import {
  STORE_METAOBJECT_TYPE,
  storeToMetaobjectFields,
  storeToMetaobjectHandle,
} from '../src/metaobject-mapping';
import type { Store } from '../src/store';

const STORE: Store = {
  storeId: 'f52b6ee0_4734_4e36_8929_95fb2304aa4b',
  name: 'Louvre',
  lat: 48.8595,
  lng: 2.3406,
  address1: '1 Place du Louvre',
  address2: '',
  city: 'Paris',
  zip: '75001',
  countryCode: 'FR',
  phone: '+33 1 23 45 67 89',
  email: '',
  website: 'https://example.com',
  openingHours: { timezone: 'Europe/Paris', days: { '1': [{ start: '09:00', end: '17:00' }] } as never },
  types: ['TWASH'],
  tags: ['VISA'],
  lastUpdated: '2026-02-19T07:55:57Z',
  userProperties: null,
};

const byKey = (fields: { key: string; value: string }[]): Record<string, string> =>
  Object.fromEntries(fields.map((f) => [f.key, f.value]));

describe('storeToMetaobjectHandle', () => {
  it('lower-cases and keeps the id underscores/hyphens for an idempotent handle', () => {
    expect(storeToMetaobjectHandle({ storeId: 'f52b6ee0_4734_4e36_8929_95fb2304aa4b' })).toBe(
      'f52b6ee0_4734_4e36_8929_95fb2304aa4b',
    );
  });

  it('collapses illegal characters to a single hyphen and trims', () => {
    expect(storeToMetaobjectHandle({ storeId: 'Store #12 / Paris!' })).toBe('store-12-paris');
  });

  it('caps the handle at 255 characters', () => {
    expect(storeToMetaobjectHandle({ storeId: 'a'.repeat(400) }).length).toBe(255);
  });
});

describe('storeToMetaobjectFields', () => {
  it('maps every populated field with stringified numbers and JSON hours', () => {
    const fields = byKey(storeToMetaobjectFields(STORE));
    expect(fields['store_id']).toBe('f52b6ee0_4734_4e36_8929_95fb2304aa4b');
    expect(fields['name']).toBe('Louvre');
    expect(fields['address1']).toBe('1 Place du Louvre');
    expect(fields['city']).toBe('Paris');
    expect(fields['zip']).toBe('75001');
    expect(fields['country_code']).toBe('FR');
    expect(fields['lat']).toBe('48.8595');
    expect(fields['lng']).toBe('2.3406');
    expect(fields['phone']).toBe('+33 1 23 45 67 89');
    expect(fields['website']).toBe('https://example.com');
    expect(JSON.parse(fields['hours']!).timezone).toBe('Europe/Paris');
  });

  it('omits empty values so Shopify never sees an empty url/number/text', () => {
    const fields = byKey(storeToMetaobjectFields(STORE));
    expect(fields).not.toHaveProperty('address2');
    expect(fields).not.toHaveProperty('email');
  });

  it('omits lat/lng and hours when absent', () => {
    const fields = byKey(
      storeToMetaobjectFields({ ...STORE, lat: null, lng: null, openingHours: null }),
    );
    expect(fields).not.toHaveProperty('lat');
    expect(fields).not.toHaveProperty('lng');
    expect(fields).not.toHaveProperty('hours');
  });

  it('never emits a description field (merchant-owned, not clobbered by sync)', () => {
    const keys = storeToMetaobjectFields(STORE).map((f) => f.key);
    expect(keys).not.toContain('description');
    expect(keys).not.toContain('seo');
  });

  it('exposes the metaobject type constant', () => {
    expect(STORE_METAOBJECT_TYPE).toBe('store');
  });
});
