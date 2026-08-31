/**
 * The reference AREA document, next to `example-page.ts`.
 *
 * A county holding four stores across three towns, inside a region that also has a
 * page: enough to show the trail, the children, the listed stores and the copy
 * generated from them, without a wall of JSON.
 */
import type { Store } from '@woosmap/store-search-client';
import { buildAreaPages } from '../src/area';
import type { AdminAreas, AreaConfig, AreaLocalPage } from '../src/types';

function store(storeId: string, name: string, city: string, lat: number, lng: number): Store {
  return {
    storeId,
    name,
    lat,
    lng,
    address1: '',
    address2: '',
    city,
    zip: '',
    countryCode: 'GB',
    phone: '',
    email: '',
    website: '',
    openingHours: null,
    types: [],
    tags: [],
    lastUpdated: '2026-08-01T10:00:00Z',
    userProperties: null,
  };
}

const OXFORDSHIRE: AdminAreas = { country: 'United Kingdom', region: 'England', county: 'Oxfordshire' };
const BERKSHIRE: AdminAreas = { country: 'United Kingdom', region: 'England', county: 'Berkshire' };

const stores: Store[] = [
  store('GB-0101', 'Oxford Cornmarket', 'Oxford', 51.7522, -1.2578),
  store('GB-0102', 'Oxford Templars', 'Oxford', 51.7712, -1.2211),
  store('GB-0103', 'Banbury Castle Quay', 'Banbury', 52.0629, -1.3398),
  store('GB-0104', 'Bicester Sheep Street', 'Bicester', 51.9, -1.1533),
  store('GB-0201', 'Reading Broad Street', 'Reading', 51.4551, -0.9787),
  store('GB-0202', 'Slough High Street', 'Slough', 51.5095, -0.5954),
];

const admin = new Map<string, AdminAreas>([
  ['gb-0101', OXFORDSHIRE],
  ['gb-0102', OXFORDSHIRE],
  ['gb-0103', OXFORDSHIRE],
  ['gb-0104', OXFORDSHIRE],
  ['gb-0201', BERKSHIRE],
  ['gb-0202', BERKSHIRE],
]);

const config: AreaConfig = {
  brand: 'Acme',
  urlBase: '/pages/regions',
  storeUrlBase: '/pages/stores',
  origin: 'https://shop.example.com',
  locale: 'en-GB',
  publicKey: 'woos-public-key-referrer-restricted',
  directionsProvider: 'google',
  map: { width: 240, height: 160, zoom: 13 },
};

const pages: AreaLocalPage[] = buildAreaPages(stores, admin, config, {
  now: '2026-08-14T06:00:00.000Z',
});

/** The county page, the interesting one: it has a parent and listed stores. */
export const EXAMPLE_AREA_PAGE: AreaLocalPage = pages.find(
  (page) => page.slug === 'england-oxfordshire',
)!;

/** Serialised exactly as it is committed, so a test can compare byte-for-byte. */
export const EXAMPLE_AREA_JSON = `${JSON.stringify(EXAMPLE_AREA_PAGE, null, 2)}\n`;
