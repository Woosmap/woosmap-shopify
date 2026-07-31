/**
 * Woosmap Store Search API wire types, ported from the maps-js
 * `stores-schema.js` (the same contract `StoresService` exposes). These describe
 * the raw REST payloads; the friendly, flat {@link ./store.Store} domain type is
 * derived from them by `featureToStore`.
 *
 * DESIGN NOTE — why these are hand-rolled instead of re-exported.
 * The sibling `@woosmap/localities-client` re-exports `@types/woosmap.map`
 * (`woosmap.map.localities.*`). That package ALSO ships `woosmap.map.stores.*`,
 * so re-exporting would be the consistent move — but it is deliberately NOT used
 * here, for two reasons that would otherwise cause real bugs:
 *   1. Its `Store.lastUpdated` reproduces an SDK typo; the live REST API returns
 *      snake_case `last_updated` (what incremental sync filters on). Re-exporting
 *      would force casts around the wrong field name everywhere.
 *   2. It marks `address`/`contact`/`open`/`weekly_opening` as REQUIRED, but the
 *      live API omits them freely; the required types fight `featureToStore`'s
 *      defensive parsing.
 * So: track the live API here, not the published types. Do NOT "simplify" this by
 * re-exporting `@types/woosmap.map` — you would silently reintroduce (1).
 * Where the SDK/types and the live API disagree, the live API wins (see
 * {@link StoreProperties.last_updated}).
 */

/** A `{ lat, lng }` coordinate, or a maps-js `LatLng` with accessor methods. */
export interface LatLngLiteral {
  lat: number;
  lng: number;
}
export interface LatLng {
  lat(): number;
  lng(): number;
}

/** GeoJSON Point. Coordinates are `[longitude, latitude]` (GeoJSON order). */
export interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number];
}

/** A highlight span in an autocomplete match. */
export interface AutocompleteMatchedSubstring {
  offset: number;
  length: number;
}

/** Pagination envelope returned by search. `max 300 assets per page`. */
export interface Pagination {
  page: number;
  pageCount: number;
}

/** An opening period within a day, in 24-hour `HH:mm`. */
export interface StoreOpeningHoursPeriod {
  start: string;
  end: string;
  'all-day'?: boolean;
}

/** One weekday of the computed weekly opening. */
export interface StoreWeeklyOpeningHoursPeriod {
  hours: StoreOpeningHoursPeriod[];
  /** Whether the hours come from a special (holiday) override. */
  isSpecial: boolean;
}

/** The computed weekly opening, keyed `"1"` (Monday) … `"7"` (Sunday). */
export interface StoreWeeklyOpening {
  timezone: string;
  '1'?: StoreWeeklyOpeningHoursPeriod;
  '2'?: StoreWeeklyOpeningHoursPeriod;
  '3'?: StoreWeeklyOpeningHoursPeriod;
  '4'?: StoreWeeklyOpeningHoursPeriod;
  '5'?: StoreWeeklyOpeningHoursPeriod;
  '6'?: StoreWeeklyOpeningHoursPeriod;
  '7'?: StoreWeeklyOpeningHoursPeriod;
}

/** The declared usual opening, keyed `"1"` … `"7"` plus an optional `default`. */
export interface StoreOpeningHoursUsual {
  '1'?: StoreOpeningHoursPeriod[];
  '2'?: StoreOpeningHoursPeriod[];
  '3'?: StoreOpeningHoursPeriod[];
  '4'?: StoreOpeningHoursPeriod[];
  '5'?: StoreOpeningHoursPeriod[];
  '6'?: StoreOpeningHoursPeriod[];
  '7'?: StoreOpeningHoursPeriod[];
  default?: StoreOpeningHoursPeriod[];
}

/** Full opening-hours definition of a store. */
export interface StoreOpeningHours {
  timezone: string;
  usual: StoreOpeningHoursUsual;
  /** Keyed by `YYYY-MM-DD`; values follow the same period shape as `usual`. */
  special: Record<string, StoreOpeningHoursPeriod[]>;
}

/** The live open/closed status computed at request time. */
export interface StoreOpen {
  open_now: boolean;
  open_hours: StoreOpeningHoursPeriod[];
  current_slice?: StoreOpeningHoursPeriod;
  next_opening?: { day: string; start: string; end: string };
  week_day?: number;
}

/** Address components of a store. */
export interface StoreAddress {
  lines?: string[];
  /** ISO 3166-1 country code (lower-case in the live API, e.g. `"fr"`). */
  country_code?: string | null;
  city?: string;
  zipcode?: string;
}

/** Contact channels of a store. Values may be `null` when unset. */
export interface StoreContact {
  website: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * Raw store properties (the SDK's `Store` type). Named `StoreProperties` here so
 * the flat, consumer-facing {@link ./store.Store} can keep the friendly name.
 */
export interface StoreProperties {
  name: string;
  store_id: string;
  address?: StoreAddress;
  contact?: StoreContact;
  open?: StoreOpen;
  weekly_opening?: StoreWeeklyOpening;
  opening_hours?: StoreOpeningHours | null;
  types?: string[];
  tags?: string[];
  /**
   * Last modification timestamp (ISO 8601), used for incremental sync.
   * NOTE: the maps-js schema types this as `lastUpdated`, but the live REST API
   * returns snake_case `last_updated` — the client tracks the API, not the SDK typo.
   */
  last_updated?: string | null;
  /** Arbitrary merchant data; queryable but otherwise unstructured. */
  user_properties?: unknown;
  /** Distance in metres from the request position, when `lat`/`lng` were sent. */
  distance?: number;
}

/** A single store as a GeoJSON Feature (the SDK's `StoreResponse`). */
export interface StoreFeature {
  type: 'Feature';
  properties: StoreProperties;
  geometry: GeoJSONPoint;
}

/** The `stores/search` FeatureCollection response. */
export interface StoresSearchResponse {
  type: 'FeatureCollection';
  features: StoreFeature[];
  pagination: Pagination;
}

/** A single store autocomplete prediction. */
export interface StorePrediction {
  name: string;
  store_id: string;
  types: string[];
  highlighted?: number;
  matched_substrings?: AutocompleteMatchedSubstring[];
}

/** The `stores/autocomplete` response. */
export interface StoresAutocompleteResponse {
  predictions: StorePrediction[];
}

/** The `stores/search/bounds` response. */
export interface StoresBoundsResponse {
  bounds: { north: number; east: number; south: number; west: number } | number[][];
}

/** Request for {@link StoreSearchClient.search}. Mirrors `StoresSearchRequest`. */
export interface StoresSearchRequest {
  /** Query-syntax filter, e.g. `type:"grocery"` or `last_updated:>="2026-01-01T00:00:00"`. */
  query?: string;
  /** Bias results around a coordinate (requires both lat and lng). */
  latLng?: LatLng | LatLngLiteral;
  /** Circular radius in metres around `latLng`. */
  radius?: number;
  /**
   * A pre-encoded Google polyline to search along, sent to the REST API as
   * `encoded_polyline`. Unlike the SDK this client does NOT accept raw coordinate
   * arrays: encoding them would pull in a polyline dependency and break the
   * zero-dependency, worker-safe guarantee. Encode client-side and pass the string.
   */
  polyline?: string;
  /** Results per page (default 100, max 300). */
  storesByPage?: number;
  /** 1-based page number. */
  page?: number;
  /** Whether to search stores intersecting a zone at `latLng`. */
  zone?: boolean;
}

/** Request for {@link StoreSearchClient.autocomplete}. Mirrors `StoresAutocompleteRequest`. */
export interface StoresAutocompleteRequest {
  query?: string;
  language?: string;
  /** Max results (default 5, max 50). */
  limit?: number;
}

/** Request for {@link StoreSearchClient.getBounds}. Mirrors `StoresBoundsRequest`. */
export interface StoresBoundsRequest {
  query?: string;
  latLng?: LatLng | LatLngLiteral;
  radius?: number;
}
