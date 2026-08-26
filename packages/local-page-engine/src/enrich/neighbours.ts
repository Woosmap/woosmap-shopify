// Nearest N *other* stores within a radius → the "other stores nearby" section.
// Server-rendered, so the internal links help crawlers move between store pages.
// Computed in memory (haversine) from the full store set: no extra API calls, and
// recomputed each run so a new store appears on its neighbours' pages.

import type { Store } from '@woosmap/store-search-client';
import { storeSlug } from '../slug';
import { DEFAULT_URL_BASE } from '../local-page';
import type { NearbyStore, NearbyStoresOptions, StoreIndexEntry } from '../types';

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two points, in kilometres (haversine). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}

/** In-memory index from the full store set; drops stores without coords or name. */
export function buildStoreIndex(stores: Store[]): StoreIndexEntry[] {
  const index: StoreIndexEntry[] = [];
  for (const store of stores) {
    if (store.lat === null || store.lng === null || !store.name) continue;
    const handle = storeSlug(store.storeId);
    if (!handle) continue;
    index.push({ handle, name: store.name, city: store.city ?? null, lat: store.lat, lng: store.lng });
  }
  return index;
}

/**
 * Nearest `limit` other stores within `radiusKm`, sorted by exact distance, rounded
 * up to whole km for display. Excludes the store itself.
 *
 * Straight-line, not road distance: it costs no API call and this section is
 * internal linking, not navigation. Worth a conscious decision though — road-accurate
 * distance is part of the pitch.
 */
export function findNearbyStores(
  store: Store,
  index: StoreIndexEntry[],
  options: NearbyStoresOptions = {},
): NearbyStore[] {
  if (store.lat === null || store.lng === null) return [];
  const radiusKm = options.radiusKm ?? 10;
  const limit = options.limit ?? 3;
  const urlBase = options.urlBase ?? DEFAULT_URL_BASE;
  const selfHandle = storeSlug(store.storeId);

  const measured: Array<{ entry: StoreIndexEntry; km: number }> = [];
  for (const entry of index) {
    if (entry.handle === selfHandle) continue;
    const km = haversineKm(store.lat, store.lng, entry.lat, entry.lng);
    if (km > radiusKm) continue;
    measured.push({ entry, km });
  }
  measured.sort((a, b) => a.km - b.km);
  return measured.slice(0, limit).map(({ entry, km }) => ({
    handle: entry.handle,
    url: `${urlBase}/${entry.handle}`,
    name: entry.name,
    city: entry.city,
    km: Math.ceil(km),
  }));
}
