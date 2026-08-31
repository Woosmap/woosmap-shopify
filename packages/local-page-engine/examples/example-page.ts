/**
 * The inputs behind `local-page.example.json`, kept importable so a test can
 * rebuild the document and compare it to the committed file. Without that guard the
 * reference output silently rots the first time the model changes, which is exactly
 * the file a client's developer would be reading.
 */
import type { Store } from '@woosmap/store-search-client';
import { buildLocalPage } from '../src/local-page';
import type {
  AdminAreas,
  StoreLocalPage,
  LocalPageConfig,
  NearbyData,
  NearbyStore,
} from '../src/types';

const store: Store = {
  storeId: 'FR-0421',
  name: 'Berkeley Square',
  lat: 48.8698,
  lng: 2.3075,
  address1: '27 Avenue des Champs-Élysées',
  address2: '',
  city: 'Paris',
  zip: '75008',
  countryCode: 'FR',
  phone: '+33142250101',
  email: 'champs-elysees@example.com',
  website: 'https://example.com/stores/champs-elysees',
  openingHours: {
    timezone: 'Europe/Paris',
    days: {
      '1': [{ start: '09:30', end: '19:30' }],
      '2': [{ start: '09:30', end: '19:30' }],
      '3': [{ start: '09:30', end: '19:30' }],
      '4': [{ start: '09:30', end: '19:30' }],
      '5': [{ start: '09:30', end: '20:00' }],
      '6': [{ start: '10:00', end: '20:00' }],
      '7': [],
    },
  },
  types: ['Flagship'],
  tags: ['CLICK_AND_COLLECT', 'WHEELCHAIR_ACCESS'],
  lastUpdated: '2026-08-11T09:12:44.000Z',
  userProperties: { surface_m2: 780 },
};

const admin: AdminAreas = {
  country: 'France',
  region: 'Île-de-France',
  county: 'Paris',
  city: 'Paris',
};

const nearby: NearbyData = {
  updated_at: '2026-08-13T04:00:00.000Z',
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
          distance: '210 m',
          duration: '3 mins',
        },
        {
          name: 'George V',
          lat: 48.871944,
          lng: 2.300833,
          category: 'transit.station.rail.subway',
          distance: '580 m',
          duration: '8 mins',
        },
      ],
    },
    {
      key: 'parking',
      title: 'Parking',
      icon: 'parking',
      mode: 'driving',
      items: [
        {
          name: 'Parking Ponthieu',
          lat: 48.870766,
          lng: 2.308997,
          category: 'business.parking',
          distance: '400 m',
          duration: '2 mins',
        },
      ],
    },
  ],
};

const nearbyStores: NearbyStore[] = [
  { handle: 'fr-0422', url: '/pages/stores/fr-0422', name: 'Opéra', city: 'Paris', km: 2 },
  { handle: 'fr-0438', url: '/pages/stores/fr-0438', name: 'Rivoli', city: 'Paris', km: 3 },
];

const config: LocalPageConfig = {
  brand: 'Acme',
  urlBase: '/pages/stores',
  origin: 'https://shop.example.com',
  locale: 'en-GB',
  publicKey: 'woos-public-key-referrer-restricted',
  directionsProvider: 'google',
};

/** The reference document. Deterministic: the timestamp is fixed, not read from the clock. */
export const EXAMPLE_PAGE: StoreLocalPage = buildLocalPage(
  store,
  { admin, nearby, nearbyStores },
  config,
  { now: '2026-08-14T06:00:00.000Z' },
);

/** Serialised exactly as it is committed, so a test can compare byte-for-byte. */
export const EXAMPLE_JSON = `${JSON.stringify(EXAMPLE_PAGE, null, 2)}\n`;
