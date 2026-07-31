import type {
  LatLng,
  LatLngLiteral,
  StoresAutocompleteRequest,
  StoresBoundsRequest,
  StoresSearchRequest,
} from './types';

/**
 * Query-parameter encoders, ported from the maps-js `stores-service.js`
 * `prepare*Request` helpers. The SDK maps a camelCase request onto the REST
 * API's snake_case params (`latLng` → `lat`+`lng`, `storesByPage` →
 * `stores_by_page`); since this client hits REST directly it reproduces that
 * mapping. `URLSearchParams` handles percent-encoding of the query syntax.
 */

/** Resolve a `LatLng` (literal or accessor form) to a plain literal. */
export function transformLatLng(latLng: LatLng | LatLngLiteral): LatLngLiteral {
  const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
  const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;
  return { lat, lng };
}

/** Set a query parameter only when the value is meaningful (non-empty). */
function setIf(params: URLSearchParams, key: string, value: string | null | undefined): void {
  if (value !== null && value !== undefined && value !== '') {
    params.set(key, value);
  }
}

function applyLatLng(params: URLSearchParams, latLng: LatLng | LatLngLiteral | undefined): void {
  if (latLng) {
    const { lat, lng } = transformLatLng(latLng);
    params.set('lat', String(lat));
    params.set('lng', String(lng));
  }
}

/** Encode a {@link StoresSearchRequest} into `stores/search` query params. */
export function encodeSearchParams(request: StoresSearchRequest): URLSearchParams {
  const params = new URLSearchParams();
  setIf(params, 'query', request.query);
  applyLatLng(params, request.latLng);
  setIf(params, 'radius', request.radius !== undefined ? String(request.radius) : null);
  // REST param is `encoded_polyline` (the maps-js SDK's `polyline` is the SDK-side name).
  setIf(params, 'encoded_polyline', request.polyline);
  setIf(params, 'stores_by_page', request.storesByPage !== undefined ? String(request.storesByPage) : null);
  setIf(params, 'page', request.page !== undefined ? String(request.page) : null);
  setIf(params, 'zone', request.zone ? 'true' : null);
  return params;
}

/** Encode a {@link StoresAutocompleteRequest} into `stores/autocomplete` query params. */
export function encodeAutocompleteParams(request: StoresAutocompleteRequest): URLSearchParams {
  const params = new URLSearchParams();
  setIf(params, 'query', request.query);
  setIf(params, 'language', request.language);
  setIf(params, 'limit', request.limit !== undefined ? String(request.limit) : null);
  return params;
}

/** Encode a {@link StoresBoundsRequest} into `stores/search/bounds` query params. */
export function encodeBoundsParams(request: StoresBoundsRequest): URLSearchParams {
  const params = new URLSearchParams();
  setIf(params, 'query', request.query);
  applyLatLng(params, request.latLng);
  setIf(params, 'radius', request.radius !== undefined ? String(request.radius) : null);
  return params;
}
