// Area pages, grouped from data already resolved (the store's own `city` plus the
// reverse-geocoded country, region and county), so they cost no API call.

import type { Store } from '@woosmap/store-search-client';
import {
  buildAreaIntro,
  buildAreaSeo,
  DEFAULT_AREA_INTRO,
  DEFAULT_AREA_LEVEL_LABELS,
  DEFAULT_AREA_SEO,
  storeNoun,
} from './area-copy';
import { buildTrailJsonLd } from './json-ld';
import { applyTemplate } from './seo';
import { DEFAULT_URL_BASE } from './local-page';
import { areaSlug, canonicalPath, canonicalUrl, MAX_SLUG, storeSlug } from './slug';
import { staticMapAt } from './static-map';
import type {
  AdminAreas,
  AreaChild,
  AreaConfig,
  AreaFacts,
  AreaIntroTemplates,
  AreaLevel,
  AreaLocalPage,
  AreaSeoTemplates,
  AreaStore,
  AreaTrailRung,
} from './types';

/** The levels, coarsest first. The order the trail is walked in. */
const AREA_LEVELS: AreaLevel[] = ['country', 'region', 'county', 'city'];

const LEVEL_RANK = Object.fromEntries(AREA_LEVELS.map((level, i) => [level, i])) as Record<
  AreaLevel,
  number
>;

/**
 * Where area pages live by default.
 *
 * One prefix serves every level, because a platform that grants a page one path segment
 * (Shopify does) cannot name it per level. `regions` reads well for the default
 * `region` + `county` set, where the slug leads with the region. A network that enables
 * `city` or `country` should pick its own word at setup: changing it later means
 * redirecting every page.
 */
const DEFAULT_AREA_URL_BASE = '/pages/regions';

/** Region and county. A country page adds nothing to a single-country network. */
const DEFAULT_AREA_LEVELS: AreaLevel[] = ['region', 'county'];

/** Below this many stores an area is too thin to deserve its own page. */
const DEFAULT_AREA_MIN_STORES = 2;

/** Extra inputs the engine cannot derive on its own. */
export interface BuildAreaPagesOptions {
  /** ISO timestamp stamped onto every page. Injected, so a build is reproducible. */
  now: string;
}

/** The rules in force for one country, defaults filled in. */
interface Rules {
  levels: AreaLevel[];
  minStores: number;
  levelLabels: Record<AreaLevel, string>;
  intro: AreaIntroTemplates;
  seo: AreaSeoTemplates;
}

/** A country's own entry wins over the defaults, key by key. Memoised. */
function rulesResolver(config: AreaConfig): (countryCode: string | null) => Rules {
  const cache = new Map<string, Rules>();

  return (countryCode) => {
    const key = countryCode ?? '';
    const hit = cache.get(key);
    if (hit) return hit;

    // Tolerate a lower-cased ISO code.
    const own =
      config.byCountry && countryCode
        ? (config.byCountry[countryCode] ??
          config.byCountry[countryCode.toUpperCase()] ??
          config.byCountry[countryCode.toLowerCase()])
        : undefined;

    const rules: Rules = {
      levels: own?.levels ?? config.levels ?? DEFAULT_AREA_LEVELS,
      minStores: own?.minStores ?? config.minStores ?? DEFAULT_AREA_MIN_STORES,
      levelLabels: { ...DEFAULT_AREA_LEVEL_LABELS, ...config.levelLabels, ...own?.levelLabels },
      intro: { ...DEFAULT_AREA_INTRO, ...config.intro, ...own?.intro },
      seo: { ...DEFAULT_AREA_SEO, ...config.seo, ...own?.seo },
    };
    cache.set(key, rules);
    return rules;
  };
}

/** One rung of a store's trail: an enabled level and its value. */
interface Rung {
  level: AreaLevel;
  value: string;
}

/**
 * A store's trail across the ENABLED levels only, blanks and consecutive duplicates
 * dropped. Restricting to the enabled levels first is what keeps a city-state from
 * vanishing: with `region === county`, the one surviving rung is one that gets a page.
 */
function buildTrail(store: Store, admin: AdminAreas, levels: AreaLevel[]): Rung[] {
  const enabled = new Set(levels);
  const values: Record<AreaLevel, string | undefined> = {
    country: admin.country,
    region: admin.region,
    county: admin.county,
    city: store.city ?? undefined,
  };

  const trail: Rung[] = [];
  for (const level of AREA_LEVELS) {
    if (!enabled.has(level)) continue;
    const value = (values[level] ?? '').trim();
    if (value === '') continue;
    if (trail.length > 0 && trail[trail.length - 1]!.value === value) continue;
    trail.push({ level, value });
  }
  return trail;
}

/** Accumulator for one area while stores are still being folded in. */
interface Draft {
  /** The hierarchy down to and including this area. Built from the parent's, never re-derived. */
  trail: AreaTrailRung[];
  /**
   * The smallest floor among the countries of its members. Smallest, so a parent can never
   * be stricter than a child: two countries can share a region name (Limburg, Tirol,
   * Luxembourg), and a parent dropped under a child would leave the child's trail linking
   * to a page nobody produced.
   */
  minStores: number;
  countryCode: string | null;
  country: string | null;
  stores: Map<string, AreaStore>;
  children: Set<string>;
  towns: Set<string>;
}

/**
 * Group stores into area pages. An area is an AGGREGATE, which is why this cannot be one
 * more `enrich` step: the store count is only known once every store has been seen.
 *
 * `adminByHandle` is keyed by store slug.
 *
 * A store with a county but no region (which `hasAdmin` permits) forms its own area rather
 * than joining the fuller one: inventing the missing rung would file stores under a region
 * nobody resolved.
 */
export function buildAreaPages(
  stores: Store[],
  adminByHandle: Map<string, AdminAreas>,
  config: AreaConfig,
  options: BuildAreaPagesOptions,
): AreaLocalPage[] {
  const urlBase = config.urlBase ?? DEFAULT_AREA_URL_BASE;
  const storeUrlBase = config.storeUrlBase ?? DEFAULT_URL_BASE;
  const pathOf = (slug: string): string => canonicalPath(urlBase, slug);
  const rulesFor = rulesResolver(config);
  const drafts = new Map<string, Draft>();

  for (const store of stores) {
    if (store.lat === null || store.lng === null || !store.name) continue;
    const handle = storeSlug(store.storeId);
    if (!handle) continue;

    const admin = adminByHandle.get(handle) ?? {};
    const rules = rulesFor(store.countryCode);
    const trail = buildTrail(store, admin, rules.levels);
    if (trail.length === 0) continue;

    const town = (store.city ?? '').trim();
    const member: AreaStore = {
      handle,
      url: canonicalPath(storeUrlBase, handle),
      name: store.name,
      city: town === '' ? null : town,
      lat: store.lat,
      lng: store.lng,
      map: staticMapAt(
        store.lat,
        store.lng,
        config.publicKey,
        config.map ?? {},
        applyTemplate(rules.seo.mapAlt, { name: store.name }),
      ),
    };

    // Every rung gets this store, so a region lists all its stores as well as its counties.
    let parent: Draft | undefined;
    for (const rung of trail) {
      const own = areaSlug(rung.value);
      if (own === '') continue;
      const parentSlug = parent?.trail[parent.trail.length - 1]!.slug;
      const slug = parentSlug ? `${parentSlug}-${own}`.slice(0, MAX_SLUG) : own;

      let draft = drafts.get(slug);
      if (!draft) {
        const self: AreaTrailRung = { level: rung.level, name: rung.value, slug, path: pathOf(slug) };
        draft = {
          trail: parent ? [...parent.trail, self] : [self],
          minStores: rules.minStores,
          countryCode: store.countryCode,
          country: null,
          stores: new Map(),
          children: new Set(),
          towns: new Set(),
        };
        drafts.set(slug, draft);
      } else if (rules.minStores < draft.minStores) {
        draft.minStores = rules.minStores;
      }
      // Country is not a rung when that level is off, so the first member that has one wins:
      // the first member outright may not be enriched yet.
      draft.country ??= (admin.country ?? '').trim() || null;
      draft.stores.set(handle, member);
      if (town !== '') draft.towns.add(town);
      if (parent) parent.children.add(slug);

      parent = draft;
    }
  }

  const kept = new Map<string, Draft>();
  for (const [slug, draft] of drafts) {
    if (draft.stores.size >= draft.minStores) {
      kept.set(slug, draft);
    }
  }

  const pages: AreaLocalPage[] = [];

  for (const draft of kept.values()) {
    const self = draft.trail[draft.trail.length - 1]!;
    const rules = rulesFor(draft.countryCode);
    const at = (level: AreaLevel): string | null =>
      draft.trail.find((rung) => rung.level === level)?.name ?? null;

    // A parent holds every store its children do and never a stricter floor, so it is never
    // the one dropped: only child links need pruning.
    const children: AreaChild[] = [];
    for (const slug of draft.children) {
      const child = kept.get(slug);
      if (child) {
        const rung = child.trail[child.trail.length - 1]!;
        children.push({ slug, path: rung.path, name: rung.name, storeCount: child.stores.size });
      }
    }
    children.sort((a, b) => a.name.localeCompare(b.name));

    const facts: AreaFacts = {
      name: self.name,
      levelLabel: rules.levelLabels[self.level],
      storeCount: draft.stores.size,
      children: children.map((child) => ({ name: child.name, storeCount: child.storeCount })),
      towns: [...draft.towns],
      country: draft.country,
      region: at('region'),
      county: at('county'),
    };

    const noun = storeNoun(facts.storeCount, rules.intro);
    const absolute = canonicalUrl(config.origin, self.path);
    const ancestors = draft.trail.slice(0, -1).map((rung) => rung.name);
    // The country opens the breadcrumb even when that level has no page of its own. Not on a
    // country page: a breadcrumb never contains its own subject.
    const breadcrumb =
      draft.country && self.level !== 'country' && ancestors[0] !== draft.country
        ? [draft.country, ...ancestors]
        : ancestors;

    pages.push({
      slug: self.slug,
      canonicalPath: self.path,
      canonicalUrl: absolute,
      subject: {
        kind: 'area',
        level: self.level,
        name: self.name,
        levelLabel: facts.levelLabel,
        trail: draft.trail,
        intro: buildAreaIntro(facts, config.brand, rules.intro),
        children,
        stores: [...draft.stores.values()].sort((a, b) => a.name.localeCompare(b.name)),
      },
      locale: config.locale ?? null,
      admin: {
        ...(draft.country ? { country: draft.country } : {}),
        ...(facts.region ? { region: facts.region } : {}),
        ...(facts.county ? { county: facts.county } : {}),
      },
      breadcrumb,
      seo: buildAreaSeo(facts, config.brand, self.path, rules.seo, noun),
      jsonLd: buildTrailJsonLd(draft.trail, config.origin),
      map: null,
      directionsProvider: config.directionsProvider ?? null,
      computedAt: options.now,
    });
  }

  pages.sort(
    (a, b) =>
      LEVEL_RANK[a.subject.level] - LEVEL_RANK[b.subject.level] || a.slug.localeCompare(b.slug),
  );
  return pages;
}

/**
 * The slugs that exist downstream but are no longer produced. It retires nothing when the
 * grouping came back empty, which keeps a failed run from deleting the whole network.
 */
export function selectStaleAreas(existing: string[], computed: AreaLocalPage[]): string[] {
  const live = new Set(computed.map((page) => page.slug));
  if (live.size === 0) return [];
  return existing.filter((slug) => !live.has(slug)).sort();
}
