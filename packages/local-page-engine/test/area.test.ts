import { describe, it, expect } from 'vitest';
import type { Store } from '@woosmap/store-search-client';
import { buildAreaPages, selectStaleAreas } from '../src/area';
import type { AdminAreas, AreaLocalPage } from '../src/types';
import { makeStore } from './fixtures';

const options = { now: '2026-08-27T06:00:00.000Z' };

/** A store plus the admin values a reverse-geocode would have resolved for it. */
interface Seed {
  id: string;
  name: string;
  city?: string;
  countryCode?: string;
  admin: AdminAreas;
}

function seedsToInput(seeds: Seed[]): [Store[], Map<string, AdminAreas>] {
  const stores: Store[] = [];
  const admin = new Map<string, AdminAreas>();
  for (const seed of seeds) {
    stores.push(
      makeStore({
        storeId: seed.id,
        name: seed.name,
        city: seed.city ?? seed.name,
        countryCode: seed.countryCode ?? 'GB',
      }),
    );
    admin.set(seed.id.toLowerCase(), seed.admin);
  }
  return [stores, admin];
}

const ENGLAND = (county: string): AdminAreas => ({
  country: 'United Kingdom',
  region: 'England',
  county,
});

/** Two stores per county is the floor, so this is the smallest network with pages. */
const UK: Seed[] = [
  { id: 'GB-1', name: 'Manchester Arndale', admin: ENGLAND('Greater Manchester') },
  { id: 'GB-2', name: 'Salford', admin: ENGLAND('Greater Manchester') },
  { id: 'GB-3', name: 'Oxford Cornmarket', admin: ENGLAND('Oxfordshire') },
  { id: 'GB-4', name: 'Banbury', admin: ENGLAND('Oxfordshire') },
];

function build(seeds: Seed[], config = {}): AreaLocalPage[] {
  const [stores, admin] = seedsToInput(seeds);
  return buildAreaPages(stores, admin, config, options);
}

function bySlug(pages: AreaLocalPage[]): Record<string, AreaLocalPage> {
  return Object.fromEntries(pages.map((page) => [page.slug, page]));
}

describe('buildAreaPages: the tree', () => {
  it('gives every enabled level a page, coarsest first', () => {
    const pages = build(UK);
    expect(pages.map((page) => [page.slug, page.subject.level])).toEqual([
      ['england', 'region'],
      ['england-greater-manchester', 'county'],
      ['england-oxfordshire', 'county'],
    ]);
  });

  it('gives a region every store its counties hold', () => {
    const pages = bySlug(build(UK));
    expect(pages['england']!.subject.stores.length).toBe(4);
    expect(pages['england-oxfordshire']!.subject.stores.length).toBe(2);
  });

  it('lists the children of a region, with their own paths', () => {
    const england = bySlug(build(UK))['england']!;
    expect(england.subject.children).toEqual([
      { slug: 'england-greater-manchester', path: '/pages/regions/england-greater-manchester', name: 'Greater Manchester', storeCount: 2 },
      { slug: 'england-oxfordshire', path: '/pages/regions/england-oxfordshire', name: 'Oxfordshire', storeCount: 2 },
    ]);
  });

  it('leaves a leaf area without children', () => {
    expect(bySlug(build(UK))['england-oxfordshire']!.subject.children).toEqual([]);
  });

  it('sorts the listed stores by name', () => {
    const stores = bySlug(build(UK))['england']!.subject.stores.map((s) => s.name);
    expect(stores).toEqual(['Banbury', 'Manchester Arndale', 'Oxford Cornmarket', 'Salford']);
  });

  it('links each listed store to its own page', () => {
    const first = bySlug(build(UK))['england-oxfordshire']!.subject.stores[0]!;
    expect([first.handle, first.url]).toEqual(['gb-4', '/pages/stores/gb-4']);
  });
});

describe('buildAreaPages: the floor', () => {
  it('drops an area below the minimum', () => {
    const thin = [...UK, { id: 'GB-9', name: 'Truro', admin: ENGLAND('Cornwall') }];
    expect(Object.keys(bySlug(build(thin)))).not.toContain('england-cornwall');
  });

  it('keeps the dropped area out of its parent children, but keeps its store in the count', () => {
    const thin = [...UK, { id: 'GB-9', name: 'Truro', admin: ENGLAND('Cornwall') }];
    const england = bySlug(build(thin))['england']!;
    expect(england.subject.children.map((c) => c.name)).toEqual(['Greater Manchester', 'Oxfordshire']);
    expect(england.subject.stores.length).toBe(5);
  });

  it('honours a raised floor', () => {
    expect(Object.keys(bySlug(build(UK, { minStores: 3 })))).toEqual(['england']);
  });
});

describe('buildAreaPages: hierarchies that differ', () => {
  it('does not let a city-state vanish when region and county are the same name', () => {
    const cardiff: Seed[] = [
      { id: 'GB-5', name: 'Cardiff Queen St', admin: { country: 'United Kingdom', region: 'Wales', county: 'Cardiff' } },
      { id: 'GB-6', name: 'Cardiff Bay', admin: { country: 'United Kingdom', region: 'Wales', county: 'Cardiff' } },
    ];
    expect(Object.keys(bySlug(build(cardiff)))).toEqual(['wales', 'wales-cardiff']);
  });

  it('drops a consecutive duplicate rung instead of repeating it', () => {
    const luxembourg: Seed[] = [
      { id: 'LU-1', name: 'Gare', countryCode: 'LU', admin: { country: 'Luxembourg', region: 'Luxembourg', county: 'Luxembourg' } },
      { id: 'LU-2', name: 'Kirchberg', countryCode: 'LU', admin: { country: 'Luxembourg', region: 'Luxembourg', county: 'Luxembourg' } },
    ];
    expect(Object.keys(bySlug(build(luxembourg)))).toEqual(['luxembourg']);
  });

  it('gives a store with a county but no region its own area rather than inventing the rung', () => {
    const orphan: Seed[] = [
      { id: 'GB-7', name: 'Jersey Town', admin: { country: 'United Kingdom', county: 'Jersey' } },
      { id: 'GB-8', name: 'Jersey Port', admin: { country: 'United Kingdom', county: 'Jersey' } },
    ];
    expect(Object.keys(bySlug(build(orphan)))).toEqual(['jersey']);
  });

  it('folds accents and expands & in a slug', () => {
    const france: Seed[] = [
      { id: 'FR-1', name: 'Dijon', countryCode: 'FR', admin: { country: 'France', region: 'Bourgogne', county: "Côte-d'Or" } },
      { id: 'FR-2', name: 'Beaune', countryCode: 'FR', admin: { country: 'France', region: 'Bourgogne', county: "Côte-d'Or" } },
      { id: 'GB-A', name: 'Bath', admin: ENGLAND('Bath & North East Somerset') },
      { id: 'GB-B', name: 'Keynsham', admin: ENGLAND('Bath & North East Somerset') },
    ];
    const slugs = Object.keys(bySlug(build(france)));
    expect(slugs).toContain('bourgogne-cote-d-or');
    expect(slugs).toContain('england-bath-and-north-east-somerset');
  });
});

describe('buildAreaPages: per-country rules', () => {
  const mixed: Seed[] = [
    ...UK,
    { id: 'FR-3', name: 'Bordeaux', countryCode: 'FR', admin: { country: 'France', region: 'Nouvelle-Aquitaine', county: 'Gironde' } },
    { id: 'FR-4', name: 'Mérignac', countryCode: 'FR', admin: { country: 'France', region: 'Nouvelle-Aquitaine', county: 'Gironde' } },
  ];

  it('applies a country override without touching the other countries', () => {
    const pages = bySlug(build(mixed, { byCountry: { FR: { levels: ['region'] } } }));
    expect(Object.keys(pages)).toEqual([
      'england',
      'nouvelle-aquitaine',
      'england-greater-manchester',
      'england-oxfordshire',
    ]);
  });

  it('labels a level in the country language', () => {
    const pages = bySlug(build(mixed, { byCountry: { FR: { levelLabels: { county: 'Département' } } } }));
    expect(pages['nouvelle-aquitaine-gironde']!.subject.levelLabel).toBe('Département');
    expect(pages['england-oxfordshire']!.subject.levelLabel).toBe('County');
  });

  it('matches a country code whatever its case', () => {
    const pages = bySlug(build(mixed, { byCountry: { fr: { minStores: 3 } } }));
    expect(Object.keys(pages)).not.toContain('nouvelle-aquitaine-gironde');
  });

  it('enables the country level when a network spans several countries', () => {
    const pages = bySlug(build(mixed, { levels: ['country', 'region', 'county'] }));
    expect(pages['united-kingdom']!.subject.level).toBe('country');
    expect(pages['united-kingdom-england-oxfordshire']!.subject.name).toBe('Oxfordshire');
  });
});

describe('buildAreaPages: the trail', () => {
  it('carries every rung down to the area itself', () => {
    const oxfordshire = bySlug(build(UK))['england-oxfordshire']!;
    expect(oxfordshire.subject.trail).toEqual([
      { level: 'region', name: 'England', slug: 'england', path: '/pages/regions/england' },
      {
        level: 'county',
        name: 'Oxfordshire',
        slug: 'england-oxfordshire',
        path: '/pages/regions/england-oxfordshire',
      },
    ]);
  });

  it('opens the breadcrumb with the country even when it has no page', () => {
    expect(bySlug(build(UK))['england-oxfordshire']!.breadcrumb).toEqual([
      'United Kingdom',
      'England',
    ]);
  });

  it('leaves a country page out of its own breadcrumb', () => {
    const pages = bySlug(build(UK, { levels: ['country', 'region', 'county'] }));
    expect(pages['united-kingdom']!.breadcrumb).toEqual([]);
  });

  it('gives every rung of the trail the path of a page that exists', () => {
    const pages = build(UK, { levels: ['country', 'region', 'county'] });
    const live = new Set(pages.map((page) => page.canonicalPath));
    const paths = pages.flatMap((page) => page.subject.trail.map((rung) => rung.path));
    expect(paths.filter((path) => !live.has(path))).toEqual([]);
  });

  it('keeps a parent alive when a country floor would drop it under its child', () => {
    // Two countries share the region name, and only one of them raises the floor.
    const shared: Seed[] = [
      { id: 'FR-9', name: 'Strasbourg', countryCode: 'FR', admin: { country: 'France', region: 'Rhine' } },
      { id: 'DE-1', name: 'Freiburg', countryCode: 'DE', admin: { country: 'Germany', region: 'Rhine', county: 'Breisgau' } },
      { id: 'DE-2', name: 'Emmendingen', countryCode: 'DE', admin: { country: 'Germany', region: 'Rhine', county: 'Breisgau' } },
    ];
    const pages = build(shared, { byCountry: { FR: { minStores: 5 } } });
    const live = new Set(pages.map((page) => page.canonicalPath));
    const paths = pages.flatMap((page) => page.subject.trail.map((rung) => rung.path));
    expect(paths.filter((path) => !live.has(path))).toEqual([]);
  });

  it('caps a concatenated slug at 255 characters', () => {
    const long = 'a'.repeat(240);
    const deep: Seed[] = [
      { id: 'GB-L1', name: 'One', admin: { country: 'United Kingdom', region: long, county: long } },
      { id: 'GB-L2', name: 'Two', admin: { country: 'United Kingdom', region: long, county: long } },
    ];
    expect(Math.max(...build(deep).map((page) => page.slug.length))).toBeLessThanOrEqual(255);
  });

  it('does not repeat the country when it is a rung of its own', () => {
    const pages = bySlug(build(UK, { levels: ['country', 'region', 'county'] }));
    expect(pages['united-kingdom-england-oxfordshire']!.breadcrumb).toEqual([
      'United Kingdom',
      'England',
    ]);
  });

  it('emits a BreadcrumbList carrying an item per rung', () => {
    const [doc] = bySlug(build(UK))['england-oxfordshire']!.jsonLd;
    expect(doc).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { position: 1, name: 'England', item: '/pages/regions/england' },
        { position: 2, name: 'Oxfordshire', item: '/pages/regions/england-oxfordshire' },
      ],
    });
  });

  it('emits no BreadcrumbList for a single-rung trail', () => {
    const cardiff: Seed[] = [
      { id: 'GB-5', name: 'Cardiff Queen St', admin: { country: 'United Kingdom', region: 'Wales', county: 'Wales' } },
      { id: 'GB-6', name: 'Cardiff Bay', admin: { country: 'United Kingdom', region: 'Wales', county: 'Wales' } },
    ];
    expect(bySlug(build(cardiff))['wales']!.jsonLd).toEqual([]);
  });
});

describe('buildAreaPages: the page around the subject', () => {
  it('locates the page under the configured prefix', () => {
    const pages = bySlug(build(UK, { urlBase: '/zones' }));
    expect(pages['england']!.canonicalPath).toBe('/zones/england');
  });

  it('resolves an absolute URL when an origin is configured', () => {
    const pages = bySlug(build(UK, { origin: 'https://shop.example.com/' }));
    expect(pages['england']!.canonicalUrl).toBe('https://shop.example.com/pages/regions/england');
  });

  it('leaves the absolute URL null without an origin', () => {
    expect(bySlug(build(UK))['england']!.canonicalUrl).toBeNull();
  });

  it('records the admin hierarchy of the area itself, not of a member store', () => {
    expect(bySlug(build(UK))['england']!.admin).toEqual({
      country: 'United Kingdom',
      region: 'England',
    });
  });

  it('has no illustration of its own', () => {
    expect(bySlug(build(UK, { publicKey: 'k' }))['england']!.map).toBeNull();
  });

  it('gives each listed store a small map when a public key is configured', () => {
    const store = bySlug(build(UK, { publicKey: 'k' }))['england-oxfordshire']!.subject.stores[0]!;
    expect(store.map).toMatchObject({ alt: 'Map showing the location of Banbury' });
    expect(store.map?.url).toContain('key=k');
  });

  it('leaves the listed stores without a map when no key is configured', () => {
    expect(bySlug(build(UK))['england']!.subject.stores[0]!.map).toBeNull();
  });

  it('stamps the injected timestamp, not the clock', () => {
    expect(bySlug(build(UK))['england']!.computedAt).toBe(options.now);
  });

  it('records the locale and the directions provider', () => {
    const pages = bySlug(build(UK, { locale: 'en-GB', directionsProvider: 'waze' }));
    expect([pages['england']!.locale, pages['england']!.directionsProvider]).toEqual([
      'en-GB',
      'waze',
    ]);
  });
});

describe('buildAreaPages: what it skips', () => {
  it('skips a store with no coordinates', () => {
    const [stores, admin] = seedsToInput(UK);
    stores[0]!.lat = null;
    expect(buildAreaPages(stores, admin, {}, options).find((p) => p.slug === 'england')!.subject.stores.length).toBe(3);
  });

  it('skips a store with no name', () => {
    const [stores, admin] = seedsToInput(UK);
    stores[0]!.name = '';
    expect(buildAreaPages(stores, admin, {}, options).find((p) => p.slug === 'england')!.subject.stores.length).toBe(3);
  });

  it('produces nothing from a store with no admin values at all', () => {
    const [stores] = seedsToInput(UK);
    expect(buildAreaPages(stores, new Map(), {}, options)).toEqual([]);
  });
});

describe('selectStaleAreas', () => {
  it('returns the slugs that are no longer produced, sorted', () => {
    const computed = build(UK);
    expect(selectStaleAreas(['england', 'england-cornwall', 'wales'], computed)).toEqual([
      'england-cornwall',
      'wales',
    ]);
  });

  it('retires nothing when the grouping came back empty', () => {
    expect(selectStaleAreas(['england', 'wales'], [])).toEqual([]);
  });

  it('retires nothing when everything is still produced', () => {
    expect(selectStaleAreas(['england'], build(UK))).toEqual([]);
  });
});
