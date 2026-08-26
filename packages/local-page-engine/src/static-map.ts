import type { Store } from '@woosmap/store-search-client';
import type { StaticMap, StaticMapConfig } from './types';

/** Geometry the Liquid template used, kept as the default so the lift is behaviour-preserving. */
export const DEFAULT_STATIC_MAP: StaticMapConfig = {
  zoom: 15,
  width: 600,
  height: 400,
  apiBase: 'https://api.woosmap.com',
};

/**
 * Static Maps illustration for a store, lifted from `store.liquid`.
 *
 * PUBLIC key only: the browser fetches the image and sends the rendering domain as
 * `Referer`, which the key's restriction is checked against — so the key must
 * allow-list whoever renders the page, not whoever built the document. The URL is
 * deterministic per store so shared caches absorb it — which also means it cannot
 * count page views.
 *
 * `alt` is passed in rather than derived here: it is indexed copy, so it belongs to
 * the SEO templates, and deriving it twice would make an override reach only one of
 * the two places it shows up.
 *
 * `null` when the store has no coordinates or no key: a page without an
 * illustration is still a valid page.
 */
export function buildStaticMap(
  store: Store,
  publicKey: string | undefined,
  overrides: Partial<StaticMapConfig> = {},
  alt: string = `Map showing the location of ${store.name}`,
): StaticMap | null {
  if (store.lat === null || store.lng === null || !publicKey) {
    return null;
  }

  const { zoom, width, height, apiBase } = { ...DEFAULT_STATIC_MAP, ...overrides };
  const marker = JSON.stringify({ lat: store.lat, lng: store.lng });

  const params = new URLSearchParams({
    lat: String(store.lat),
    lng: String(store.lng),
    zoom: String(zoom),
    width: String(width),
    height: String(height),
    markers: marker,
    key: publicKey,
  });

  return {
    url: `${apiBase}/maps/static?${params.toString()}`,
    width,
    height,
    alt,
  };
}
