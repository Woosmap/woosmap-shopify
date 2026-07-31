import type { LatLng, LatLngLiteral } from './types';

/**
 * Query-parameter encoders, ported faithfully from Maps JS `param-utils.js`.
 * The SDK encodes request params before hitting the REST API; since this client
 * hits REST directly, it must reproduce that encoding.
 *
 * Behaviour mirrors the SDK source (not its JSDoc): `encodeComponents`
 * preserves the case of the values it is given.
 */

/** Encode a coordinate (literal or `LatLng` instance) to the `"lat,lng"` string. */
export function encodeLatLng(latLng?: LatLng | LatLngLiteral): string | null {
  if (!latLng) {
    return null;
  }
  const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
  const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
  return `${lat},${lng}`;
}

/**
 * Encode country components to a pipe-separated string.
 * `{ country: ['FR', 'GB'] }` → `"country:FR|country:GB"` (case preserved).
 * Returns `null` when there is nothing to encode.
 */
export function encodeComponents(
  components?: { country?: string | string[] },
): string | null {
  if (components && typeof components === 'object') {
    const record = components as Record<string, string | string[] | undefined>;
    const parts: string[] = [];
    for (const key of Object.keys(record)) {
      const value = record[key];
      if (Array.isArray(value)) {
        for (const sub of value) {
          parts.push(`${key}:${sub}`);
        }
      } else if (value !== undefined) {
        parts.push(`${key}:${value}`);
      }
    }
    return parts.length > 0 ? parts.join('|') : null;
  }
  return null;
}

/** Encode a type or array of types to a pipe-separated string. */
export function encodeTypes(types?: string | string[]): string | null {
  if (Array.isArray(types)) {
    return types.length > 0 ? types.join('|') : null;
  }
  if (typeof types === 'string') {
    return types;
  }
  return null;
}
