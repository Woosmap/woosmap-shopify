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
  /**
   * Absolute canonical URL, when {@link LocalPageConfig.origin} is configured. `null`
   * otherwise — a consumer that knows its own origin joins it to `canonicalPath`.
   * schema.org wants absolute URLs, so a feed should configure the origin.
   */
  canonicalUrl: string | null;
  /** The store facts, straight from Store Search. */
  store: Store;
  /** BCP 47 tag the generated copy is written in, when configured. `null` otherwise. */
  locale: string | null;
  /** Administrative hierarchy, when a reverse-geocode (or Nearby) resolved it. */
  admin: AdminAreas | null;
  /** Breadcrumb trail, values only, consecutive duplicates dropped. Excludes the store itself. */
  breadcrumb: string[];
  /** Nearby POIs grouped by family, with travel time. `null` when not enriched. */
  nearby: NearbyData | null;
  /**
   * Neighbouring stores, for internal linking between pages.
   *
   * `null` and `[]` mean different things, and the difference is load-bearing for any
   * adapter that writes incrementally: `null` is "the neighbour search did not run"
   * (leave whatever is stored alone), `[]` is "it ran and this store has no
   * neighbour in radius" (clear the stored list). Collapsing the two strands stale
   * links on a page for good.
   */
  nearbyStores: NearbyStore[] | null;
  /** Search-engine metadata. */
  seo: PageSeo;
  /** schema.org documents, ready to be serialised into `<script type="application/ld+json">`. */
  jsonLd: JsonLdDocument[];
  /** The static map illustration. */
  map: StaticMap | null;
  /**
   * Which map provider a "get directions" action should open, when configured.
   * Recorded, not resolved: building the URL is the renderer's job.
   */
  directionsProvider: DirectionsProvider | null;
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
  /** Same string as {@link PageSeo.imageAlt} — one source, so an override reaches both. */
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
  /**
   * Site origin, e.g. `https://shop.example.com`. Set it to get an absolute
   * {@link LocalPage.canonicalUrl} and absolute schema.org `item` URLs — Google wants
   * absolute URLs in a `BreadcrumbList`, so a feed producer should configure this.
   */
  origin?: string;
  /**
   * BCP 47 tag for the generated copy, e.g. `fr-FR`. Recorded on the page so a
   * consumer can label it. It selects nothing on its own: the copy's language comes
   * from {@link LocalPageConfig.seo}, so set both together.
   */
  locale?: string;
  /**
   * Woosmap PUBLIC key for the static map. Omit to skip the map.
   *
   * A public key is normally referrer-restricted, and the restriction is checked
   * against the domain that loads the image — so the key configured here must
   * allow-list whoever renders the page. When the document is handed to a third
   * party, either allow-list their domain or leave this unset and let them build the
   * URL with their own key from `store.lat`/`store.lng`.
   */
  publicKey?: string;
  /** Static-map geometry and zoom. */
  map?: Partial<StaticMapConfig>;
  /** SEO copy templates. See {@link DEFAULT_SEO_TEMPLATES} for the placeholders. */
  seo?: Partial<SeoTemplates>;
  /**
   * Which map provider a "directions" action should open. Recorded verbatim on
   * {@link LocalPage.directionsProvider}; building the URL is the renderer's job.
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
 *
 * The defaults are English. A non-English network overrides all three — there is no
 * per-language default set, and {@link LocalPageConfig.locale} only labels the result.
 */
export interface SeoTemplates {
  title: string;
  description: string;
  /** Alt text for the map image. Feeds both `seo.imageAlt` and `map.alt`. */
  imageAlt: string;
}

/**
 * The enrichment a caller has already resolved (all optional).
 *
 * Absent means "not resolved" and reaches the page as `null`; present means
 * "resolved", including an empty array. See {@link LocalPage.nearbyStores} — an
 * incremental adapter needs to tell the two apart.
 */
export interface LocalPageEnrichment {
  admin?: AdminAreas | null;
  nearby?: NearbyData | null;
  nearbyStores?: NearbyStore[] | null;
}
