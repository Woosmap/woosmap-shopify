import type { Store } from '@woosmap/store-search-client';
import { canonicalUrl } from './slug';
import type { AdminAreas, AreaTrailRung, JsonLdDocument } from './types';

const SCHEMA_CONTEXT = 'https://schema.org';

/**
 * `LocalBusiness` structured data, lifted from the `store_json_ld` Liquid capture.
 *
 * Built as an object rather than concatenated strings: in Liquid a blank optional
 * left a dangling comma and silently invalidated the document, which search engines
 * discard without saying so. Optional members are omitted, not emitted empty.
 */
export function buildLocalBusinessJsonLd(
  store: Store,
  admin: AdminAreas | null | undefined,
): JsonLdDocument {
  const address: Record<string, unknown> = {
    '@type': 'PostalAddress',
    streetAddress: store.address1,
    postalCode: store.zip,
    addressLocality: store.city,
    addressCountry: store.countryCode,
  };

  const region = admin?.region;
  if (region) {
    address.addressRegion = region;
  }

  const doc: JsonLdDocument = {
    '@context': SCHEMA_CONTEXT,
    '@type': 'LocalBusiness',
    name: store.name,
    address,
  };

  if (store.lat !== null && store.lng !== null) {
    doc.geo = { '@type': 'GeoCoordinates', latitude: store.lat, longitude: store.lng };
  }
  if (store.phone) {
    doc.telephone = store.phone;
  }

  return doc;
}

/** One `BreadcrumbList`, or nothing below two rungs: a breadcrumb of one is noise. */
function breadcrumbList(
  rungs: Array<{ name: string; item?: string | null }>,
): JsonLdDocument | null {
  if (rungs.length < 2) {
    return null;
  }

  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: rungs.map((rung, index) => {
      const element: Record<string, unknown> = {
        '@type': 'ListItem',
        position: index + 1,
        name: rung.name,
      };
      if (rung.item) {
        element.item = rung.item;
      }
      return element;
    }),
  };
}

/**
 * `BreadcrumbList` for a store page: the admin trail plus the store itself, only the last
 * rung carrying an `item`. Gated on a region or county, as the template was.
 *
 * `itemUrl` should be absolute when the caller has one (Liquid's `canonical_url`).
 */
export function buildBreadcrumbJsonLd(
  breadcrumb: string[],
  storeName: string,
  itemUrl: string,
  admin: AdminAreas | null | undefined,
): JsonLdDocument | null {
  if (!admin?.region && !admin?.county) {
    return null;
  }
  return breadcrumbList([...breadcrumb.map((name) => ({ name })), { name: storeName, item: itemUrl }]);
}

/**
 * `BreadcrumbList` for an area page. Every rung has a page, so every rung carries an
 * `item`, absolute when an origin is configured: schema.org wants absolute URLs, and
 * mixing absolute and relative inside one document is worse than using neither.
 */
export function buildTrailJsonLd(
  trail: AreaTrailRung[],
  origin: string | undefined,
): JsonLdDocument[] {
  const doc = breadcrumbList(
    trail.map((rung) => ({ name: rung.name, item: canonicalUrl(origin, rung.path) ?? rung.path })),
  );
  return doc ? [doc] : [];
}
