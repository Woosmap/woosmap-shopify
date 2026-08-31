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
  /** Stable, platform-neutral identifier for this page. */
  slug: string;
  /** Path the page is expected to live at, e.g. `/pages/stores/my-store`. */
  canonicalPath: string;
  /**
   * Absolute canonical URL, when {@link LocalPageConfig.origin} is configured. `null`
   * otherwise — a consumer that knows its own origin joins it to `canonicalPath`.
   * schema.org wants absolute URLs, so a feed should configure the origin.
   */
  canonicalUrl: string | null;
  /** What the page is about. Discriminate on `subject.kind`. */
  subject: StorePageSubject | AreaPageSubject;
  /** BCP 47 tag the generated copy is written in, when configured. `null` otherwise. */
  locale: string | null;
  /** Administrative hierarchy the page sits in, when resolved. */
  admin: AdminAreas | null;
  /** Breadcrumb trail, values only, consecutive duplicates dropped. Excludes the subject itself. */
  breadcrumb: string[];
  /** Search-engine metadata. */
  seo: PageSeo;
  /** schema.org documents, ready to be serialised into `<script type="application/ld+json">`. */
  jsonLd: JsonLdDocument[];
  /** The page's own illustration. An area page has none: its maps are per listed store. */
  map: StaticMap | null;
  /**
   * Which map provider a "get directions" action should open, when configured.
   * Recorded, not resolved: building the URL is the renderer's job.
   */
  directionsProvider: DirectionsProvider | null;
  /** ISO timestamp of this build — lets a consumer reason about freshness. */
  computedAt: string;
}

/** A {@link LocalPage} known to be about a store, so `subject.store` needs no narrowing. */
export type StoreLocalPage = LocalPage & { subject: StorePageSubject };

/** A {@link LocalPage} known to be about an area. */
export type AreaLocalPage = LocalPage & { subject: AreaPageSubject };

/** A page whose subject is one store. */
export interface StorePageSubject {
  kind: 'store';
  /** The store facts, straight from Store Search. */
  store: Store;
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
}

/** Search-engine metadata for one page. */
export interface PageSeo {
  title: string;
  description: string;
  canonicalPath: string;
  /**
   * Alt text for the map image, kept next to the SEO block since it is indexed copy.
   * Nothing reads it when {@link LocalPage.map} is `null`, which is every area page.
   */
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

/**
 * One administrative level that can get its own page, coarsest first in that order.
 * `country` is off by default; a multi-country network must enable it to keep slugs unique.
 */
export type AreaLevel = 'country' | 'region' | 'county' | 'city';

/** A page whose subject is an administrative area holding several stores. */
export interface AreaPageSubject {
  kind: 'area';
  level: AreaLevel;
  /** The area's own name, e.g. `Greater Manchester`. */
  name: string;
  /** What this level is called where the area is, e.g. `County` or `Département`. */
  levelLabel: string;
  /** The hierarchy down to and including this area, coarsest first. */
  trail: AreaTrailRung[];
  /** Generated copy introducing the area. */
  intro: string;
  /** Areas one level down that also got a page. */
  children: AreaChild[];
  /** Every store in the area, including those held by its children. */
  stores: AreaStore[];
}

/** One rung of an area's hierarchy. */
export interface AreaTrailRung {
  level: AreaLevel;
  name: string;
  slug: string;
  path: string;
}

/** A child area, as listed on its parent's page. */
export interface AreaChild {
  slug: string;
  path: string;
  name: string;
  storeCount: number;
}

/** One store as listed on an area page. */
export interface AreaStore {
  handle: string;
  /** Path of the store's own page. */
  url: string;
  name: string;
  city: string | null;
  lat: number;
  lng: number;
  /** Small single-marker illustration, when a public key is configured. A consumer with
   *  its own key builds one from `lat`/`lng` instead. */
  map: StaticMap | null;
}

/**
 * Rules that differ from one country to the next. Localities normalises every country
 * onto the same four rungs, but which one is worth a page, and what it is called, does
 * not travel: a `county` is a Gironde in France and a Kreis in Germany.
 */
export interface AreaRules {
  /** Which levels get a page. Default `region` + `county`. */
  levels?: AreaLevel[];
  /** An area with fewer stores than this gets no page (thin-content guard). Default 2. */
  minStores?: number;
  /** What each level is called, used in headings and SEO copy. Defaults are English. */
  levelLabels?: Partial<Record<AreaLevel, string>>;
  /** Intro copy templates. */
  intro?: Partial<AreaIntroTemplates>;
  /** SEO copy templates. */
  seo?: Partial<AreaSeoTemplates>;
}

/**
 * Something the area grouping had to work around, handed to
 * `BuildAreaPagesOptions.onProblem`. Never fatal: each one names what was done about it,
 * so a sync can count them and a setup can act on them.
 */
export interface AreaProblem {
  kind:
    | 'unaddressable-name'
    | 'cross-country-area'
    | 'orphan-canonicalised'
    | 'ambiguous-orphan';
  /** The area name at fault, as it came from the data. */
  name: string;
  level: AreaLevel;
  /** What the engine did, and what it would take to do better. */
  detail: string;
}

/** Per-client configuration for area pages. A country entry overrides the defaults. */
export interface AreaConfig extends AreaRules {
  /** Path prefix area pages live under. Default `/pages/regions`. */
  urlBase?: string;
  /** Brand name, woven into the generated copy. */
  brand?: string;
  /** Site origin, for absolute canonical and schema.org URLs. */
  origin?: string;
  /** BCP 47 tag recorded on the page. Labels the copy, does not translate it. */
  locale?: string;
  /** Woosmap PUBLIC key. Omit to leave the listed stores without a map. */
  publicKey?: string;
  /** Static-map geometry for the listed stores. */
  map?: Partial<StaticMapConfig>;
  /** Path prefix a listed store's own page lives under. Default `/pages/stores`. */
  storeUrlBase?: string;
  /** Where a "directions" action sends the visitor. */
  directionsProvider?: DirectionsProvider;
  /** Overrides keyed by ISO 3166-1 alpha-2 country code, e.g. `GB`, `FR`. */
  byCountry?: Record<string, AreaRules>;
}

/**
 * SEO copy templates for an area page. Placeholders: `{area}` `{level}` `{count}`
 * `{brand}` `{country}` `{region}` `{county}`. Substitution and punctuation repair
 * are the same as for a store page, so an empty value leaves no debris.
 */
export interface AreaSeoTemplates {
  title: string;
  description: string;
  /** Alt text for a listed store's map. Placeholder: `{name}`. */
  mapAlt: string;
}

/**
 * Intro copy templates. Full sentences rather than a head plus fragments, because
 * clause order changes between languages.
 *
 * Placeholders: `{area}` `{level}` `{count}` `{noun}` `{brand}` `{list}` `{rest}`.
 */
export interface AreaIntroTemplates {
  /** No child area and no town to name. */
  base: string;
  /** The area has child areas with pages; `{list}` names the biggest. */
  withChildren: string;
  /** A leaf area; `{list}` names its towns. */
  withTowns: string;
  /** A leaf area with more towns than can be named; `{rest}` is how many are left. */
  withMoreTowns: string;
  /** One entry of `{list}` when naming children. Placeholders: `{count}` `{name}`. */
  childItem: string;
  /** Noun for one store, and for several. */
  storeNoun: string;
  storeNounPlural: string;
  /** Word joining the last two items of a list, e.g. `and`. */
  conjunction: string;
}

/** The facts the copy generators read, and the only thing they read. */
export interface AreaFacts {
  name: string;
  levelLabel: string;
  storeCount: number;
  children: Array<{ name: string; storeCount: number }>;
  /** Distinct town names, first seen first. */
  towns: string[];
  country: string | null;
  region: string | null;
  county: string | null;
}
