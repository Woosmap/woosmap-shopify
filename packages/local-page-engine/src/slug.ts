/**
 * Page slug from a Woosmap `store_id`.
 *
 * Byte-for-byte identical to the `storeToMetaobjectHandle` it replaces, so no page
 * already published on Shopify changes URL — and it keeps the SEO it accumulated.
 * `[a-z0-9_-]` survives; any run of anything else collapses to one hyphen, ends are
 * trimmed, capped at 255.
 */
export function storeSlug(storeId: string): string {
  return storeId
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255);
}

/** Join a path prefix and a slug into a canonical path, tolerating stray slashes. */
export function canonicalPath(urlBase: string, slug: string): string {
  const base = `/${urlBase}`.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return `${base}/${slug}`;
}

/**
 * Absolute URL for a page path, or `null` when no origin is configured.
 *
 * schema.org wants absolute URLs, so a consumer with no platform to ask (a feed)
 * needs this; a Shopify theme has Liquid's `canonical_url` and can ignore it.
 */
export function canonicalUrl(origin: string | undefined, path: string): string | null {
  const trimmed = origin?.trim().replace(/\/+$/, '');
  return trimmed ? `${trimmed}${path}` : null;
}
