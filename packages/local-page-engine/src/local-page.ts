import type { Store } from '@woosmap/store-search-client';
import { buildBreadcrumb } from './breadcrumb';
import { buildBreadcrumbJsonLd, buildLocalBusinessJsonLd } from './json-ld';
import { buildSeo } from './seo';
import { canonicalPath, storeSlug } from './slug';
import { buildStaticMap } from './static-map';
import type { JsonLdDocument, LocalPage, LocalPageConfig, LocalPageEnrichment } from './types';

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
   * Absolute URL of this page, when the caller knows it (Liquid's `canonical_url`
   * on Shopify). Used for the breadcrumb's last `item`; falls back to the path.
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
): LocalPage {
  const slug = storeSlug(store.storeId);
  const path = canonicalPath(config.urlBase ?? DEFAULT_URL_BASE, slug);

  const admin = enrichment.admin ?? null;
  const breadcrumb = buildBreadcrumb(admin);

  const jsonLd: JsonLdDocument[] = [buildLocalBusinessJsonLd(store, admin)];
  const breadcrumbLd = buildBreadcrumbJsonLd(
    breadcrumb,
    store.name,
    options.absoluteUrl ?? path,
    admin,
  );
  if (breadcrumbLd) {
    jsonLd.push(breadcrumbLd);
  }

  return {
    slug,
    canonicalPath: path,
    store,
    admin,
    breadcrumb,
    nearby: enrichment.nearby ?? null,
    nearbyStores: enrichment.nearbyStores ?? [],
    seo: buildSeo(store, admin, path, config.brand, config.seo),
    jsonLd,
    map: buildStaticMap(store, config.publicKey, config.map),
    computedAt: options.now,
  };
}
