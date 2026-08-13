import type { Store } from './store';

/**
 * Maps a Woosmap {@link Store} onto the fields of a Shopify `store` metaobject,
 * for `metaobjectUpsert` (Admin GraphQL). Emits the field list and a stable
 * handle; the caller owns the mutation and the definition `type`.
 *
 * The field keys the mapper emits MUST all exist in {@link STORE_FIELD_DEFINITIONS}
 * (the definition schema), which is the single source of truth used to create the
 * merchant-owned `store` metaobject definition at sync time. Kept in this package
 * so the schema contract lives next to the data it maps.
 *
 * Design choices that matter for a repeatable sync:
 *  - Empty values are omitted, not sent as `""`. Shopify rejects an empty
 *    `url` or `number_decimal`, and `metaobjectUpsert` leaves fields it isn't
 *    given unchanged — so omitting is both safe and correct.
 *  - `description` and the renderable SEO fields are deliberately NOT emitted:
 *    they are merchant-editable, and re-sending them each sync would clobber
 *    hand-written copy. Sync owns the facts; the merchant owns the prose.
 */

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

/**
 * The `store` metaobject definition schema — the single source of truth for
 * creating the merchant-owned definition (see `ensureStoreDefinition`). Every key
 * {@link storeToMetaobjectFields} can emit is declared here; `description` is
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
  // Server-side enriched nearby POIs (grouped) + `updated_at` for the TTL refresh.
  // Written by the store-pages sync (not by storeToMetaobjectFields), so the block
  // is rendered in HTML (SEO/GEO) instead of fetched client-side.
  { key: 'nearby', name: 'Nearby POIs', type: 'json' },
  // Administrative hierarchy (country-native values) — written by the sync's
  // reverse-geocode enrichment, for the breadcrumb + geo context. Filled once,
  // only when missing. Slugs aren't stored: they're derivable from these values
  // if/when nested URLs (area pages) land.
  { key: 'country', name: 'Country', type: 'single_line_text_field' },
  { key: 'region', name: 'Region', type: 'single_line_text_field' },
  { key: 'county', name: 'County', type: 'single_line_text_field' },
  // Server-side enriched neighbouring stores within a radius (nearest N), for the
  // "other stores nearby" section — internal links between store pages (good for
  // crawl/SEO). Recomputed each run from the full store set (haversine, no extra
  // API calls). Written by the sync, not by storeToMetaobjectFields.
  { key: 'nearby_stores', name: 'Nearby stores', type: 'json' },
  { key: 'description', name: 'Description', type: 'multi_line_text_field' },
];

/** A single Shopify metaobject field value, as `metaobjectUpsert` expects. */
export interface MetaobjectFieldInput {
  key: string;
  value: string;
}

/**
 * Build the Shopify metaobject handle for a store. Handles allow
 * `[a-z0-9_-]`; the Woosmap `store_id` is lower-cased and any other character
 * is collapsed to a single hyphen, so the handle is deterministic and the
 * upsert is idempotent (one metaobject per store, re-runnable).
 */
export function storeToMetaobjectHandle(store: Pick<Store, 'storeId'>): string {
  return store.storeId
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255);
}

/** Map a {@link Store} to Shopify metaobject fields, omitting empty values. */
export function storeToMetaobjectFields(store: Store): MetaobjectFieldInput[] {
  const fields: MetaobjectFieldInput[] = [];
  const push = (key: string, value: string | null | undefined): void => {
    if (value !== null && value !== undefined && value !== '') {
      fields.push({ key, value });
    }
  };

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

  return fields;
}
