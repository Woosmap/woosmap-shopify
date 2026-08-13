// Reverse-geocodes a store (Woosmap Localities) to country-native admin values
// (Gironde, Kent…) for the store-page breadcrumb + geo context. Filled once, only
// when missing (boundaries don't change). Pure + fetch-injected.

import { LocalitiesClient } from '@woosmap/localities-client';
import { toTransport } from './woosmap-transport';
import type { FetchLike } from './woosmap-transport';
import type { MetaobjectFieldInput } from '@woosmap/store-search-client';

const DEFAULT_API_BASE = 'https://api.woosmap.com';

/** Admin levels extracted from a reverse-geocode. */
export interface AdminAreas {
  country?: string;
  region?: string;
  county?: string;
  city?: string;
}

/** Reverse-geocode a point to its admin areas (null on any problem). Maps Woosmap
 *  component types: `state`→region, `county`→county, `locality`→city. */
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

/** Country/region/county values, empty levels omitted. `city` isn't written — it
 *  comes from the base sync. */
export function buildAdminFields(areas: AdminAreas): MetaobjectFieldInput[] {
  const fields: MetaobjectFieldInput[] = [];
  const push = (key: string, value: string | undefined): void => {
    const trimmed = (value ?? '').trim();
    if (trimmed) fields.push({ key, value: trimmed });
  };
  push('country', areas.country);
  push('region', areas.region);
  push('county', areas.county);
  return fields;
}

/** True when a reverse-geocode yielded at least a region — i.e. worth writing. */
export function hasAdmin(areas: AdminAreas | null): areas is AdminAreas {
  return !!areas && (!!areas.region || !!areas.county || !!areas.city);
}
