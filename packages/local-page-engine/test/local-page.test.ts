import { describe, expect, it } from 'vitest';
import { buildLocalPage, DEFAULT_URL_BASE } from '../src/local-page';
import { makeStore, NEARBY, NEARBY_STORES, PARIS_ADMIN } from './fixtures';

const NOW = '2026-08-14T12:00:00Z';
const options = { now: NOW };

describe('buildLocalPage', () => {
  it('derives the slug from the store id', () => {
    const page = buildLocalPage(makeStore(), {}, {}, options);
    expect(page.slug).toBe('fr-0421');
  });

  it('places the page under the default url base', () => {
    const page = buildLocalPage(makeStore(), {}, {}, options);
    expect(page.canonicalPath).toBe(`${DEFAULT_URL_BASE}/fr-0421`);
  });

  it('honours a configured url base', () => {
    const page = buildLocalPage(makeStore(), {}, { urlBase: '/magasins' }, options);
    expect(page.canonicalPath).toBe('/magasins/fr-0421');
  });

  it('stamps the injected timestamp rather than reading the clock', () => {
    const page = buildLocalPage(makeStore(), {}, {}, options);
    expect(page.computedAt).toBe(NOW);
  });

  it('builds a page with no enrichment at all', () => {
    const page = buildLocalPage(makeStore(), {}, {}, options);
    expect([page.admin, page.nearby, page.nearbyStores, page.breadcrumb]).toEqual([
      null,
      null,
      [],
      [],
    ]);
  });

  it('still emits LocalBusiness structured data without enrichment', () => {
    const page = buildLocalPage(makeStore(), {}, {}, options);
    expect(page.jsonLd).toHaveLength(1);
  });

  it('adds the breadcrumb document once an admin hierarchy resolved', () => {
    const page = buildLocalPage(makeStore(), { admin: PARIS_ADMIN }, {}, options);
    expect(page.jsonLd.map((d) => d['@type'])).toEqual(['LocalBusiness', 'BreadcrumbList']);
  });

  it('derives the breadcrumb trail from the admin areas', () => {
    const page = buildLocalPage(makeStore(), { admin: PARIS_ADMIN }, {}, options);
    expect(page.breadcrumb).toEqual(['France', 'Île-de-France', 'Paris']);
  });

  it('passes the enrichment through untouched', () => {
    const page = buildLocalPage(
      makeStore(),
      { nearby: NEARBY, nearbyStores: NEARBY_STORES },
      {},
      options,
    );
    expect([page.nearby, page.nearbyStores]).toEqual([NEARBY, NEARBY_STORES]);
  });

  it('omits the map when no public key is configured', () => {
    const page = buildLocalPage(makeStore(), {}, {}, options);
    expect(page.map).toBeNull();
  });

  it('builds the map when a public key is configured', () => {
    const page = buildLocalPage(makeStore(), {}, { publicKey: 'k' }, options);
    expect(page.map?.url).toContain('key=k');
  });

  it('uses the absolute url for the breadcrumb item when the caller knows it', () => {
    const page = buildLocalPage(makeStore(), { admin: PARIS_ADMIN }, {}, {
      ...options,
      absoluteUrl: 'https://shop.example.com/pages/stores/fr-0421',
    });
    const items = page.jsonLd[1]!.itemListElement as Array<Record<string, unknown>>;
    expect(items[items.length - 1]!.item).toBe('https://shop.example.com/pages/stores/fr-0421');
  });

  it('falls back to the canonical path when no absolute url is supplied', () => {
    const page = buildLocalPage(makeStore(), { admin: PARIS_ADMIN }, {}, options);
    const items = page.jsonLd[1]!.itemListElement as Array<Record<string, unknown>>;
    expect(items[items.length - 1]!.item).toBe(`${DEFAULT_URL_BASE}/fr-0421`);
  });

  it('is pure: the same inputs give a deeply equal page', () => {
    const store = makeStore();
    const first = buildLocalPage(store, { admin: PARIS_ADMIN }, { publicKey: 'k' }, options);
    const second = buildLocalPage(store, { admin: PARIS_ADMIN }, { publicKey: 'k' }, options);
    expect(first).toEqual(second);
  });
});
