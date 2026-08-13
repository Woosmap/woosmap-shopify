// Server-side "nearby POIs" enrichment: for SEO/GEO the block must be in the
// rendered HTML, not fetched in the browser. Builds the grouped POI payload for
// one store from Woosmap Localities Nearby + a per-mode Distance Matrix time.
// The POI families are CONFIGURABLE (see parseNearbyGroups / NEARBY_GROUPS_JSON);
// DEFAULT_NEARBY_GROUPS is just the out-of-the-box default. Pure + transport-
// injected (uses the PRIVATE key).

import { DistanceClient } from '@woosmap/distance-client';
import { LocalitiesClient } from '@woosmap/localities-client';
import { toTransport } from './woosmap-transport';
import type { FetchLike } from './woosmap-transport';

export type { FetchLike };

const DEFAULT_API_BASE = 'https://api.woosmap.com';

/** Distance Matrix travel mode used per group. */
type TravelMode = 'walking' | 'driving';

/** One nearby POI as stored (and rendered). */
export interface NearbyPoi {
  name: string;
  lat: number;
  lng: number;
  category: string;
  /** Walking distance text, e.g. "498 m" (absent if the matrix had no result). */
  distance?: string;
  /** Walking duration text, e.g. "7 mins". */
  duration?: string;
}

/** A rendered group (one Woosmap category family). */
interface NearbyGroup {
  key: string;
  title: string;
  icon: string;
  /** Travel mode used for this group's distances ("walk" vs "drive" in the UI). */
  mode: TravelMode;
  items: NearbyPoi[];
}

/** The payload stored in the `nearby` metaobject field. */
export interface NearbyData {
  /** ISO timestamp of this enrichment — drives the TTL refresh. */
  updated_at: string;
  groups: NearbyGroup[];
}

/** Definition of a nearby group: which Woosmap types, radius, cap, optional filter. */
export interface NearbyGroupSpec {
  key: string;
  title: string;
  icon: string;
  types: string;
  radius: number;
  max: number;
  /** Distance mode: you walk to a station, you drive to a parking/fuel/shop. */
  mode: TravelMode;
  /** Keep only results whose categories intersect this list (e.g. metro/train). */
  filter?: string[];
}

/** Default set (retail store visitor): rail transport (walking), cash/fuel/food
 *  (driving). Override per integration with NEARBY_GROUPS_JSON — see parseNearbyGroups. */
export const DEFAULT_NEARBY_GROUPS: NearbyGroupSpec[] = [
  { key: 'transit', title: 'Public transport', icon: 'transit', types: 'transit.station', radius: 1000, max: 3, mode: 'walking', filter: ['transit.station.rail.subway', 'transit.station.rail.train'] },
  { key: 'cash', title: 'Cash & banks', icon: 'cash', types: 'business.finance', radius: 1000, max: 1, mode: 'driving' },
  { key: 'fuel', title: 'Fuel', icon: 'fuel', types: 'business.fuel', radius: 2000, max: 1, mode: 'driving' },
  { key: 'food', title: 'Food & drink', icon: 'food', types: 'business.food_and_drinks', radius: 1000, max: 2, mode: 'driving' },
];

/**
 * Parse a `NEARBY_GROUPS_JSON` override into validated specs. Empty/absent → the
 * default set. Throws on invalid JSON or a bad shape — a config error should
 * surface at startup, not silently fall back to defaults.
 */
export function parseNearbyGroups(json: string | undefined | null): NearbyGroupSpec[] {
  if (!json || json.trim() === '') return DEFAULT_NEARBY_GROUPS;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(`NEARBY_GROUPS_JSON is not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('NEARBY_GROUPS_JSON must be a non-empty array of group specs.');
  }
  return raw.map(validateGroupSpec);
}

function validateGroupSpec(g: unknown, i: number): NearbyGroupSpec {
  const o = (g ?? {}) as Record<string, unknown>;
  const str = (k: string): string => {
    if (typeof o[k] !== 'string' || o[k] === '') throw new Error(`NEARBY_GROUPS_JSON[${i}].${k} must be a non-empty string.`);
    return o[k] as string;
  };
  const num = (k: string): number => {
    if (typeof o[k] !== 'number' || !Number.isFinite(o[k])) throw new Error(`NEARBY_GROUPS_JSON[${i}].${k} must be a number.`);
    return o[k] as number;
  };
  if (o.mode !== 'walking' && o.mode !== 'driving') {
    throw new Error(`NEARBY_GROUPS_JSON[${i}].mode must be "walking" or "driving".`);
  }
  const spec: NearbyGroupSpec = { key: str('key'), title: str('title'), icon: str('icon'), types: str('types'), radius: num('radius'), max: num('max'), mode: o.mode };
  if (o.filter !== undefined) {
    if (!Array.isArray(o.filter) || !o.filter.every((f) => typeof f === 'string')) {
      throw new Error(`NEARBY_GROUPS_JSON[${i}].filter must be an array of strings.`);
    }
    spec.filter = o.filter as string[];
  }
  return spec;
}

interface NearbyApiResult {
  name?: string;
  categories?: string[];
  types?: string[];
  geometry?: { location?: { lat?: number; lng?: number } };
}

/** Map a Localities Nearby result to a {@link NearbyPoi}, or null when unusable. */
function toPoi(result: NearbyApiResult): NearbyPoi | null {
  const loc = result.geometry?.location;
  if (!result.name || typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') {
    return null;
  }
  const cats = result.categories ?? result.types ?? [];
  return { name: result.name, lat: loc.lat, lng: loc.lng, category: cats[0] ?? '' };
}

/** Fetch and shape one group's POIs (filtered + capped). Never throws — returns []. */
export async function fetchNearbyGroup(
  fetchImpl: FetchLike,
  privateKey: string,
  lat: number,
  lng: number,
  group: NearbyGroupSpec,
  apiBase: string = DEFAULT_API_BASE,
): Promise<NearbyPoi[]> {
  const client = new LocalitiesClient({ privateKey, privateKeyIn: 'query', baseUrl: apiBase, transport: toTransport(fetchImpl) });
  try {
    const res = await client.nearby({ location: { lat, lng }, types: group.types, radius: group.radius });
    let items = res.results.map(toPoi).filter((p): p is NearbyPoi => p !== null);
    if (group.filter) {
      const allowed = group.filter;
      items = items.filter((p) => allowed.includes(p.category));
    }
    return items.slice(0, group.max);
  } catch {
    return [];
  }
}

/** Add distance/duration to each POI in place (one Distance Matrix call for `mode`). */
export async function addDistances(
  fetchImpl: FetchLike,
  privateKey: string,
  lat: number,
  lng: number,
  pois: NearbyPoi[],
  mode: TravelMode,
  apiBase: string = DEFAULT_API_BASE,
): Promise<void> {
  if (pois.length === 0) return;
  const client = new DistanceClient({ privateKey, baseUrl: apiBase, transport: toTransport(fetchImpl) });
  try {
    const elements = await client.travelTimes({ lat, lng }, pois.map((p) => ({ lat: p.lat, lng: p.lng })), mode);
    pois.forEach((poi, i) => {
      const el = elements[i];
      if (el && el.status === 'OK') {
        if (el.distance?.text) poi.distance = el.distance.text;
        if (el.duration?.text) poi.duration = el.duration.text;
      }
    });
  } catch {
    // Leave POIs without distance — the page still renders their names.
  }
}

/**
 * Build the full nearby payload for one store: each group's POIs + per-mode
 * distances + the timestamp. `groups` defaults to {@link DEFAULT_NEARBY_GROUPS}.
 * `now` is injected (ISO string) for deterministic tests. Empty groups are dropped.
 */
export async function enrichNearby(
  fetchImpl: FetchLike,
  privateKey: string,
  lat: number,
  lng: number,
  now: string,
  groups: NearbyGroupSpec[] = DEFAULT_NEARBY_GROUPS,
  apiBase: string = DEFAULT_API_BASE,
): Promise<NearbyData> {
  const perGroup = await Promise.all(
    groups.map((group) => fetchNearbyGroup(fetchImpl, privateKey, lat, lng, group, apiBase)),
  );
  const rendered: NearbyGroup[] = [];
  const byMode: Record<TravelMode, NearbyPoi[]> = { walking: [], driving: [] };
  groups.forEach((spec, i) => {
    const items = perGroup[i]!;
    if (items.length > 0) {
      rendered.push({ key: spec.key, title: spec.title, icon: spec.icon, mode: spec.mode, items });
      byMode[spec.mode].push(...items);
    }
  });
  // One Distance Matrix call per mode: walking for transit, driving for the rest.
  await Promise.all(
    (Object.keys(byMode) as TravelMode[]).map((mode) =>
      addDistances(fetchImpl, privateKey, lat, lng, byMode[mode], mode, apiBase),
    ),
  );
  return { updated_at: now, groups: rendered };
}

/**
 * TTL check: is a stored `updated_at` older than `maxAgeDays` (or missing/invalid)?
 * Returns true when the store must be (re)enriched.
 */
export function isNearbyStale(updatedAt: string | null | undefined, maxAgeDays: number, now: Date): boolean {
  if (!updatedAt) return true;
  const then = Date.parse(updatedAt);
  if (Number.isNaN(then)) return true;
  const ageMs = now.getTime() - then;
  return ageMs >= maxAgeDays * 24 * 60 * 60 * 1000;
}
