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
      null,
      [],
    ]);
  });

  it('tells "no neighbour search" (null) apart from "no neighbours" ([])', () => {
    const notRun = buildLocalPage(makeStore(), {}, {}, options);
    const ranAndFoundNone = buildLocalPage(makeStore(), { nearbyStores: [] }, {}, options);
    expect([notRun.nearbyStores, ranAndFoundNone.nearbyStores]).toEqual([null, []]);
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

  it('gives the map and the SEO block the same alt text', () => {
    const page = buildLocalPage(makeStore(), {}, { publicKey: 'k' }, options);
    expect(page.map?.alt).toBe(page.seo.imageAlt);
  });

  it('lets an imageAlt override reach the map too, not just the SEO block', () => {
    const page = buildLocalPage(
      makeStore(),
      {},
      { publicKey: 'k', seo: { imageAlt: 'Carte de {name}' } },
      options,
    );
    expect([page.seo.imageAlt, page.map?.alt]).toEqual([
      'Carte de Berkeley Square',
      'Carte de Berkeley Square',
    ]);
  });

  it('records the configured directions provider on the page', () => {
    const page = buildLocalPage(makeStore(), {}, { directionsProvider: 'waze' }, options);
    expect(page.directionsProvider).toBe('waze');
  });

  it('leaves the directions provider null when none is configured', () => {
    expect(buildLocalPage(makeStore(), {}, {}, options).directionsProvider).toBeNull();
  });

  it('records the configured locale so a consumer can label the copy', () => {
    const page = buildLocalPage(makeStore(), {}, { locale: 'fr-FR' }, options);
    expect([page.locale, buildLocalPage(makeStore(), {}, {}, options).locale]).toEqual([
      'fr-FR',
      null,
    ]);
  });

  it('resolves an absolute canonical url from the configured origin', () => {
    const page = buildLocalPage(makeStore(), {}, { origin: 'https://shop.example.com/' }, options);
    expect(page.canonicalUrl).toBe('https://shop.example.com/pages/stores/fr-0421');
  });

  it('leaves the canonical url null when no origin is configured', () => {
    expect(buildLocalPage(makeStore(), {}, {}, options).canonicalUrl).toBeNull();
  });

  it('uses the origin-derived url for the breadcrumb item when no per-store url is given', () => {
    const page = buildLocalPage(
      makeStore(),
      { admin: PARIS_ADMIN },
      { origin: 'https://shop.example.com' },
      options,
    );
    const items = page.jsonLd[1]!.itemListElement as Array<Record<string, unknown>>;
    expect(items[items.length - 1]!.item).toBe('https://shop.example.com/pages/stores/fr-0421');
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
