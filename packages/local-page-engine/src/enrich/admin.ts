// Reverse-geocodes a store (Woosmap Localities) to country-native admin values
// (Gironde, Kent…) for the breadcrumb + geo context. Filled once, only when
// missing — administrative boundaries don't move. Transport-injected.

import { LocalitiesClient } from '@woosmap/localities-client';
import { toTransport } from './transport';
import type { FetchLike } from './transport';
import type { AdminAreas } from '../types';

const DEFAULT_API_BASE = 'https://api.woosmap.com';

/**
 * Reverse-geocode a point to its admin areas (null on any problem). Maps Woosmap
 * component types: `state`→region, `county`→county, `locality`→city. Values are
 * country-native ("Gironde", "Kent"), which is what a visitor recognises.
 *
 * Possibly avoidable: Localities Nearby returns `admin_levels` in the same response
 * as the POIs. Check the depth first — a sample gave country/locality/route only.
 */
export async function reverseGeocode(
  fetchImpl: FetchLike,
  privateKey: string,
  lat: number,
  lng: number,
  apiBase: string = DEFAULT_API_BASE,
): Promise<AdminAreas | null> {
  const client = new LocalitiesClient({ privateKey, privateKeyIn: 'query', baseUrl: apiBase, transport: toTransport(fetchImpl) });
  try {
    const res = await client.geocode({ latLng: { lat, lng } });
    const components = res.results?.[0]?.address_components;
    if (!components) return null;
    const pick = (type: string): string | undefined => {
      const c = components.find((comp) => comp.types.includes(type));
      if (!c) return undefined;
      const name = Array.isArray(c.long_name) ? c.long_name[0] : c.long_name;
      return name || undefined;
    };
    return { country: pick('country'), region: pick('state'), county: pick('county'), city: pick('locality') };
  } catch {
    return null;
  }
}

/** True when a reverse-geocode yielded something worth keeping. */
export function hasAdmin(areas: AdminAreas | null): areas is AdminAreas {
  return !!areas && (!!areas.region || !!areas.county || !!areas.city);
}
