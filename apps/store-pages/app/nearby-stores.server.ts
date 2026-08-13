// Nearest N *other* stores within a radius → the "other stores nearby" section
// (server-rendered, so the internal links help SEO). Pure, computed in memory
// (haversine) from the full store set — no extra API calls, recomputed each run so
// new stores appear on their neighbours' pages.

import { storeToMetaobjectHandle, type Store } from '@woosmap/store-search-client';

/** A store reduced to what the neighbour search needs. */
export interface StoreIndexEntry {
  handle: string;
  name: string;
  city: string | null;
  lat: number;
  lng: number;
}

/** One neighbouring store, as stored (JSON-encoded) in the `nearby_stores` field. */
export interface NearbyStore {
  handle: string;
  url: string;
  name: string;
  city: string | null;
  /** Straight-line distance, rounded UP to whole km (the UI prefixes it with "~"). */
  km: number;
}

/** Tuning for {@link findNearbyStores}. */
export interface NearbyStoresOptions {
  radiusKm?: number;
  limit?: number;
  /** Path prefix for a neighbour's page, e.g. `/pages/stores`. */
  urlBase?: string;
}

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
    const handle = storeToMetaobjectHandle(store);
    if (!handle) continue;
    index.push({ handle, name: store.name, city: store.city ?? null, lat: store.lat, lng: store.lng });
  }
  return index;
}

/** Nearest `limit` other stores within `radiusKm`, sorted by exact distance,
 *  distance rounded UP to whole km for display. Excludes the store itself. */
export function findNearbyStores(
  store: Store,
  index: StoreIndexEntry[],
  options: NearbyStoresOptions = {},
): NearbyStore[] {
  if (store.lat === null || store.lng === null) return [];
  const radiusKm = options.radiusKm ?? 10;
  const limit = options.limit ?? 3;
  const urlBase = options.urlBase ?? '/pages/stores';
  const selfHandle = storeToMetaobjectHandle(store);

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
