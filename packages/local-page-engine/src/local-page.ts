import type { Store } from '@woosmap/store-search-client';
import { buildBreadcrumb } from './breadcrumb';
import { buildBreadcrumbJsonLd, buildLocalBusinessJsonLd } from './json-ld';
import { buildSeo } from './seo';
import { canonicalPath, canonicalUrl, storeSlug } from './slug';
import { buildStaticMap } from './static-map';
import type { JsonLdDocument, LocalPageConfig, LocalPageEnrichment, StoreLocalPage } from './types';

/** Default path prefix — matches where Shopify serves metaobject pages today. */
export const DEFAULT_URL_BASE = '/pages/stores';

/** Extra inputs a caller may supply that the engine cannot derive on its own. */
export interface BuildLocalPageOptions {
  /**
   * ISO timestamp stamped onto the page. Injected rather than read from the clock
   * so a build is reproducible and its tests are not time-dependent.
   */
  now: string;
  /**
   * Absolute URL of this page, when the caller knows it per-store (Liquid's
   * `canonical_url` on Shopify). Used for the breadcrumb's last `item`. Falls back to
   * the origin-derived {@link LocalPage.canonicalUrl}, then to the bare path.
   */
  absoluteUrl?: string;
}

/**
 * Compose one {@link LocalPage} from a store, the enrichment already resolved, and
 * the client's config.
 *
 * Pure: no fetch, no clock, no filesystem. Enrichment is resolved by the caller and
 * `now` is injected, so the same function runs in a CLI today and inside the
 * platform later without a rewrite. Enrichment is optional throughout — a store
 * with no nearby data still yields a valid page.
 */
export function buildLocalPage(
  store: Store,
  enrichment: LocalPageEnrichment,
  config: LocalPageConfig,
  options: BuildLocalPageOptions,
): StoreLocalPage {
  const slug = storeSlug(store.storeId);
  const path = canonicalPath(config.urlBase ?? DEFAULT_URL_BASE, slug);
  const absolute = canonicalUrl(config.origin, path);

  const admin = enrichment.admin ?? null;
  const breadcrumb = buildBreadcrumb(admin);
  const seo = buildSeo(store, admin, path, config.brand, config.seo);

  const jsonLd: JsonLdDocument[] = [buildLocalBusinessJsonLd(store, admin)];
  const breadcrumbLd = buildBreadcrumbJsonLd(
    breadcrumb,
    store.name,
    options.absoluteUrl ?? absolute ?? path,
    admin,
  );
  if (breadcrumbLd) {
    jsonLd.push(breadcrumbLd);
  }

  return {
    slug,
    canonicalPath: path,
    canonicalUrl: absolute,
    subject: {
      kind: 'store',
      store,
      nearby: enrichment.nearby ?? null,
      // `?? null`, not `?? []`: "the search did not run" and "it ran, no neighbour" are
      // different instructions to an adapter that writes incrementally.
      nearbyStores: enrichment.nearbyStores ?? null,
    },
    locale: config.locale ?? null,
    admin,
    breadcrumb,
    seo,
    jsonLd,
    // One alt text, from the SEO templates, so an override reaches both places it appears.
    map: buildStaticMap(store, config.publicKey, config.map, seo.imageAlt),
    directionsProvider: config.directionsProvider ?? null,
    computedAt: options.now,
  };
}
