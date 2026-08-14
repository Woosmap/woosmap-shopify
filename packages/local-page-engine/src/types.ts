import type { Store } from '@woosmap/store-search-client';

/**
 * The contract of this package: everything a local store page needs, as data,
 * with no platform in it. A Shopify adapter maps it onto metaobject fields; a
 * feed serves it as-is; a server-rendered page renders it directly.
 *
 * Deliberately NOT in here: HTML, Liquid, CSS, metaobject field keys, or
 * anything that assumes who renders the page.
 */
export interface LocalPage {
  /** Stable, platform-neutral identifier for this page (derived from the store id). */
  slug: string;
  /** Path the page is expected to live at, e.g. `/pages/stores/my-store`. */
  canonicalPath: string;
  /** The store facts, straight from Store Search. */
  store: Store;
  /** Administrative hierarchy, when a reverse-geocode (or Nearby) resolved it. */
  admin: AdminAreas | null;
  /** Breadcrumb trail, values only, consecutive duplicates dropped. Excludes the store itself. */
  breadcrumb: string[];
  /** Nearby POIs grouped by family, with travel time. `null` when not enriched. */
  nearby: NearbyData | null;
  /** Neighbouring stores, for internal linking between pages. */
  nearbyStores: NearbyStore[];
  /** Search-engine metadata. */
  seo: PageSeo;
  /** schema.org documents, ready to be serialised into `<script type="application/ld+json">`. */
  jsonLd: JsonLdDocument[];
  /** The static map illustration. */
  map: StaticMap | null;
  /** ISO timestamp of this build — lets a consumer reason about freshness. */
  computedAt: string;
}

/** Search-engine metadata for one page. */
export interface PageSeo {
  title: string;
  description: string;
  canonicalPath: string;
  /** Alt text for the map image, kept next to the SEO block since it is indexed copy. */
  imageAlt: string;
}

/** A ready-to-serialise schema.org document. */
export type JsonLdDocument = Record<string, unknown>;

/** The static map illustration for a store page. */
export interface StaticMap {
  url: string;
  width: number;
  height: number;
  alt: string;
}

/** Administrative levels around a store. */
export interface AdminAreas {
  country?: string;
  region?: string;
  county?: string;
  city?: string;
}

/** One nearby POI. */
export interface NearbyPoi {
  name: string;
  lat: number;
  lng: number;
  category: string;
  /** Human-readable distance, e.g. `"498 m"`. Absent when the matrix had no result. */
  distance?: string;
  /** Human-readable duration, e.g. `"7 mins"`. */
  duration?: string;
}

/** Travel mode used to compute a group's distances. */
export type TravelMode = 'walking' | 'driving';

/** One POI family, as rendered. */
export interface NearbyGroup {
  key: string;
  title: string;
  icon: string;
  mode: TravelMode;
  items: NearbyPoi[];
}

/** The nearby-POI enrichment payload. `updated_at` drives the TTL refresh. */
export interface NearbyData {
  updated_at: string;
  groups: NearbyGroup[];
}

/**
 * Definition of a POI family to enrich with: which Woosmap types, how far, how
 * many, and how you travel there. This is the per-client knob that makes a new
 * client a tuning job — a DIY chain wants parking, a city-centre chain wants metro.
 */
export interface NearbyGroupSpec {
  key: string;
  title: string;
  icon: string;
  types: string;
  radius: number;
  max: number;
  /** You walk to a station, you drive to a parking or a fuel station. */
  mode: TravelMode;
  /** Keep only results whose category is in this list (e.g. metro/train only). */
  filter?: string[];
}

/** A store reduced to what the neighbour search needs. */
export interface StoreIndexEntry {
  handle: string;
  name: string;
  city: string | null;
  lat: number;
  lng: number;
}

/** Tuning for the neighbour search. */
export interface NearbyStoresOptions {
  radiusKm?: number;
  limit?: number;
  /** Path prefix for a neighbour's page, e.g. `/pages/stores`. */
  urlBase?: string;
}

/** One neighbouring store. */
export interface NearbyStore {
  handle: string;
  url: string;
  name: string;
  city: string | null;
  /** Straight-line distance, rounded up to whole km. */
  km: number;
}

/**
 * Per-client configuration — the first-class input that makes a new client a
 * tuning job rather than a code change.
 */
export interface LocalPageConfig {
  /** Brand name, used in SEO copy. */
  brand?: string;
  /** Path prefix pages live under. Default `/pages/stores`. */
  urlBase?: string;
  /** Woosmap PUBLIC key — browser surface, referrer-restricted. Omit to skip the map. */
  publicKey?: string;
  /** Static-map geometry and zoom. */
  map?: Partial<StaticMapConfig>;
  /** SEO copy templates. See {@link DEFAULT_SEO_TEMPLATES} for the placeholders. */
  seo?: Partial<SeoTemplates>;
  /**
   * Which map provider the "directions" action should open. The page model only
   * records the choice; building the URL is the renderer's job.
   */
  directionsProvider?: DirectionsProvider;
}

/** Where a "get directions" action sends the visitor. */
export type DirectionsProvider = 'woosmap' | 'google' | 'apple' | 'waze';

/** Static-map geometry. */
export interface StaticMapConfig {
  zoom: number;
  width: number;
  height: number;
  /** API base, overridable for tests or a regional endpoint. */
  apiBase: string;
}

/**
 * SEO copy templates. Placeholders are substituted verbatim, missing values
 * collapse to an empty string and surrounding separators are cleaned up:
 * `{name}`, `{city}`, `{region}`, `{country}`, `{brand}`, `{address}`, `{zip}`.
 */
export interface SeoTemplates {
  title: string;
  description: string;
  imageAlt: string;
}

/** The enrichment a caller has already resolved (all optional). */
export interface LocalPageEnrichment {
  admin?: AdminAreas | null;
  nearby?: NearbyData | null;
  nearbyStores?: NearbyStore[];
}
