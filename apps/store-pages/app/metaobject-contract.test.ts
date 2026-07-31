import { describe, it, expect } from 'vitest';
import { storeToMetaobjectFields, STORE_FIELD_DEFINITIONS, type Store } from '@woosmap/store-search-client';

// Guards the coupling that has no compiler to catch it: every field KEY the mapper
// emits must be declared in STORE_FIELD_DEFINITIONS — the schema used to CREATE the
// merchant-owned `store` metaobject definition (ensureStoreDefinition). If the mapper
// and the schema drift, this fails instead of the sync dropping data at runtime (or
// `metaobjectUpsert` rejecting an undeclared key).

/** A fully-populated store so the mapper emits every key it can. */
const FULL_STORE: Store = {
  storeId: 'store_1',
  name: 'Store 1',
  lat: 48.8,
  lng: 2.3,
  address1: '1 rue',
  address2: 'apt 2',
  city: 'Paris',
  zip: '75001',
  countryCode: 'FR',
  phone: '+33',
  email: 'a@b.co',
  website: 'https://x',
  openingHours: { timezone: 'Europe/Paris', days: {} as never },
  types: [],
  tags: [],
  lastUpdated: null,
  userProperties: null,
};

describe('metaobject field contract (mapper ↔ STORE_FIELD_DEFINITIONS)', () => {
  it('every field key the mapper emits is declared in the definition schema', () => {
    const declared = new Set(STORE_FIELD_DEFINITIONS.map((f) => f.key));
    expect(declared.size).toBeGreaterThan(0); // sanity

    const emitted = storeToMetaobjectFields(FULL_STORE).map((f) => f.key);
    const missing = emitted.filter((key) => !declared.has(key));
    expect(missing).toEqual([]);
  });

  it('the schema declares the required identity fields', () => {
    const required = new Set(STORE_FIELD_DEFINITIONS.filter((f) => f.required).map((f) => f.key));
    expect(required.has('store_id')).toBe(true);
    expect(required.has('name')).toBe(true);
  });
});
