// The Shopify adapter: a LocalPage → `store` metaobject fields.
//
// This used to live in `@woosmap/store-search-client`, which meant a Shopify
// metaobject schema — enriched keys and all — was the de facto contract of the
// whole workspace. It is now the other way round: `@woosmap/local-page-engine`
// owns the contract, and this file is one consumer of it. A feed adapter, or a
// server-rendered page, is a sibling of this file, not a fork of the engine.

import type { LocalPage } from '@woosmap/local-page-engine';

/** The metaobject definition type these fields belong to (merchant-owned; no `$app:` prefix). */
export const STORE_METAOBJECT_TYPE = 'store';

/** One field of the `store` metaobject definition. */
export interface StoreFieldDefinition {
  key: string;
  name: string;
  /** Shopify metaobject field type, e.g. `single_line_text_field`, `number_decimal`, `url`, `json`. */
  type: string;
  required?: boolean;
}

/** A single Shopify metaobject field value, as `metaobjectUpsert` expects. */
export interface MetaobjectFieldInput {
  key: string;
  value: string;
}

/**
 * The `store` metaobject definition schema — the single source of truth for
 * creating the merchant-owned definition (see `ensureStoreDefinition`). Every key
 * {@link localPageToMetaobjectFields} can emit is declared here; `description` is
 * declared (merchant-editable) but never written by the sync.
 */
export const STORE_FIELD_DEFINITIONS: StoreFieldDefinition[] = [
  { key: 'store_id', name: 'Woosmap store ID', type: 'single_line_text_field', required: true },
  { key: 'name', name: 'Name', type: 'single_line_text_field', required: true },
  { key: 'address1', name: 'Address line 1', type: 'single_line_text_field' },
  { key: 'address2', name: 'Address line 2', type: 'single_line_text_field' },
  { key: 'city', name: 'City', type: 'single_line_text_field' },
  { key: 'zip', name: 'Postal code', type: 'single_line_text_field' },
  { key: 'country_code', name: 'Country code', type: 'single_line_text_field' },
  { key: 'lat', name: 'Latitude', type: 'number_decimal' },
  { key: 'lng', name: 'Longitude', type: 'number_decimal' },
  { key: 'phone', name: 'Phone', type: 'single_line_text_field' },
  { key: 'email', name: 'Email', type: 'single_line_text_field' },
  { key: 'website', name: 'Website', type: 'url' },
  { key: 'hours', name: 'Opening hours', type: 'json' },
  { key: 'types', name: 'Types', type: 'list.single_line_text_field' },
  { key: 'tags', name: 'Tags', type: 'list.single_line_text_field' },
  // Enrichment, server-side so the blocks are rendered in HTML (SEO/GEO) instead of
  // fetched client-side. `nearby` carries its own `updated_at`, which drives the TTL.
  { key: 'nearby', name: 'Nearby POIs', type: 'json' },
  { key: 'country', name: 'Country', type: 'single_line_text_field' },
  { key: 'region', name: 'Region', type: 'single_line_text_field' },
  { key: 'county', name: 'County', type: 'single_line_text_field' },
  { key: 'nearby_stores', name: 'Nearby stores', type: 'json' },
  { key: 'description', name: 'Description', type: 'multi_line_text_field' },
];

/**
 * Map a {@link LocalPage} onto Shopify metaobject fields.
 *
 * Empty values are omitted, not sent as `""`: Shopify rejects an empty `url` or
 * `number_decimal`, and `metaobjectUpsert` leaves fields it isn't given unchanged.
 * `description` and the renderable SEO fields are never written — they are
 * merchant-editable, and the sync owns the facts, not the prose.
 *
 * Enrichment is emitted only when the page carries it, which preserves the runner's
 * conditional behaviour for free: a fresh TTL means no `nearby` key, so the stored
 * value survives.
 *
 * `nearby_stores` is the case where that rule needs care. The neighbour search runs
 * on every sync, and a store can legitimately end up with none — a neighbour closed,
 * or the radius was tightened. That result must be written as `[]`, because omitting
 * it would leave yesterday's neighbours in place and `store.liquid` renders them as
 * links to pages that may no longer exist. So the test is `!== null` (did the search
 * run?), not `.length > 0` (did it find anything?).
 *
 * `page.seo`, `page.jsonLd` and `page.map` are deliberately unmapped — Shopify
 * covers them (the `renderable` capability, and `store.liquid` builds its own). They
 * exist for adapters that have no such platform. The cost is a live duplicate:
 * folding the Liquid onto a `json` field fed from `page.jsonLd` would remove it, but
 * that changes what the storefront renders and wants its own dev-store pass.
 */
export function localPageToMetaobjectFields(page: LocalPage): MetaobjectFieldInput[] {
  const fields: MetaobjectFieldInput[] = [];
  const push = (key: string, value: string | null | undefined): void => {
    if (value !== null && value !== undefined && value !== '') {
      fields.push({ key, value });
    }
  };

  const store = page.store;
  push('store_id', store.storeId);
  push('name', store.name);
  push('address1', store.address1);
  push('address2', store.address2);
  push('city', store.city);
  push('zip', store.zip);
  push('country_code', store.countryCode);
  push('lat', store.lat !== null ? String(store.lat) : null);
  push('lng', store.lng !== null ? String(store.lng) : null);
  push('phone', store.phone);
  push('email', store.email);
  push('website', store.website);
  push('hours', store.openingHours ? JSON.stringify(store.openingHours) : null);
  // List fields (list.single_line_text_field) take a JSON-encoded array string.
  push('types', store.types && store.types.length > 0 ? JSON.stringify(store.types) : null);
  push('tags', store.tags && store.tags.length > 0 ? JSON.stringify(store.tags) : null);

  // Administrative levels. `city` is not written here — it already comes from the
  // store facts above, and the reverse-geocode is only a fallback for the trail.
  if (page.admin) {
    push('country', page.admin.country?.trim());
    push('region', page.admin.region?.trim());
    push('county', page.admin.county?.trim());
  }

  if (page.nearby) {
    push('nearby', JSON.stringify(page.nearby));
  }
  if (page.nearbyStores !== null) {
    // `"[]"` is a real instruction — it clears neighbours that are no longer in radius.
    push('nearby_stores', JSON.stringify(page.nearbyStores));
  }

  return fields;
}
