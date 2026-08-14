import type { Store } from '@woosmap/store-search-client';
import type { AdminAreas, JsonLdDocument } from './types';

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

/**
 * `BreadcrumbList` for the administrative trail. Two behaviours kept from the
 * template: nothing is emitted without a region or county (a one-rung breadcrumb is
 * noise), and only the last rung carries an `item` URL — area pages do not exist
 * yet, and declaring URLs that 404 is worse than declaring none.
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

  const rungs = [...breadcrumb, storeName];
  const itemListElement = rungs.map((name, index) => {
    const element: Record<string, unknown> = {
      '@type': 'ListItem',
      position: index + 1,
      name,
    };
    if (index === rungs.length - 1) {
      element.item = itemUrl;
    }
    return element;
  });

  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement,
  };
}
