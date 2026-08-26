import type { Store } from '@woosmap/store-search-client';
import type { AdminAreas, NearbyData, NearbyStore } from '../src/types';

/** A complete store, so each test can blank exactly the field it is about. */
export function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    storeId: 'FR-0421',
    name: 'Berkeley Square',
    lat: 48.8698,
    lng: 2.3075,
    address1: '27 Berkeley St',
    address2: '',
    city: 'Paris',
    zip: '75008',
    countryCode: 'FR',
    phone: '+33123456789',
    email: 'berkeley@example.com',
    website: 'https://example.com/berkeley',
    openingHours: null,
    types: ['Store'],
    tags: ['CC'],
    lastUpdated: '2026-08-01T10:00:00Z',
    userProperties: null,
    ...overrides,
  };
}

export const PARIS_ADMIN: AdminAreas = {
  country: 'France',
  region: 'Île-de-France',
  county: 'Paris',
  city: 'Paris',
};

export const NEARBY: NearbyData = {
  updated_at: '2026-08-10T08:00:00Z',
  groups: [
    {
      key: 'transit',
      title: 'Public transport',
      icon: 'transit',
      mode: 'walking',
      items: [
        {
          name: 'Franklin D. Roosevelt',
          lat: 48.869034,
          lng: 2.309927,
          category: 'transit.station.rail.subway',
          distance: '200 m',
          duration: '3 mins',
        },
      ],
    },
  ],
};

export const NEARBY_STORES: NearbyStore[] = [
  { handle: 'fr-0422', url: '/pages/stores/fr-0422', name: 'Opéra', city: 'Paris', km: 2 },
];
