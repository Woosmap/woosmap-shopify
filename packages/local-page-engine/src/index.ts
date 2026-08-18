// The page model — pure.
export { buildLocalPage, DEFAULT_URL_BASE } from './local-page';
export type { BuildLocalPageOptions } from './local-page';
export { buildBreadcrumb } from './breadcrumb';
export { buildLocalBusinessJsonLd, buildBreadcrumbJsonLd } from './json-ld';
export { buildSeo, applyTemplate, seoValues, DEFAULT_SEO_TEMPLATES } from './seo';
export { storeSlug, canonicalPath, canonicalUrl } from './slug';
export { buildStaticMap, DEFAULT_STATIC_MAP } from './static-map';

// The enrichment resolvers — I/O, over an injected fetch.
export {
  enrichNearby,
  fetchNearbyGroup,
  addDistances,
  isNearbyStale,
  parseNearbyGroups,
  DEFAULT_NEARBY_GROUPS,
} from './enrich/nearby';
export { reverseGeocode, hasAdmin } from './enrich/admin';
export { buildStoreIndex, findNearbyStores, haversineKm } from './enrich/neighbours';
export { toTransport } from './enrich/transport';
export type { FetchLike } from './enrich/transport';

export type * from './types';
