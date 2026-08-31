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
import { areaSlug, canonicalPath, canonicalUrl, childSlug, storeSlug } from './slug';
import { staticMapAt } from './static-map';
import type {
  AdminAreas,
  AreaChild,
  AreaProblem,
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
  /**
   * Called for anything the grouping had to work around. Injected rather than logged, so
   * this stays a pure function: a CLI prints these, a scheduled sync counts them.
   *
   * A problem is never fatal. The one condition that is — two countries folding into one
   * slug — throws instead, because it publishes pages that file stores across a border.
   */
  onProblem?: (problem: AreaProblem) => void;
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
  /** Every country that contributed a member. More than one means the slug is ambiguous. */
  countryCodes: Set<string>;
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
  // Deduped: one unaddressable region name is one problem, not one per store standing in it.
  const reported = new Set<string>();
  const report = (problem: AreaProblem): void => {
    const key = `${problem.kind}\u0000${problem.level}\u0000${problem.name}`;
    if (reported.has(key)) return;
    reported.add(key);
    options.onProblem?.(problem);
  };

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
      if (own === '') {
        // Stop the walk, do not skip the rung: carrying on would hand this rung's children
        // to its grandparent, and a county promoted to the root loses the region prefix
        // that keeps two same-named counties apart.
        report({
          kind: 'unaddressable-name',
          name: rung.value,
          level: rung.level,
          detail:
            'no ASCII slug can be derived from this name, so it and everything under it ' +
            'get no page. A non-Latin network needs a transliteration decided at setup.',
        });
        break;
      }
      const parentSlug = parent?.trail[parent.trail.length - 1]!.slug;
      const slug = parentSlug ? childSlug(parentSlug, own) : own;

      let draft = drafts.get(slug);
      if (!draft) {
        const self: AreaTrailRung = { level: rung.level, name: rung.value, slug, path: pathOf(slug) };
        draft = {
          trail: parent ? [...parent.trail, self] : [self],
          minStores: rules.minStores,
          countryCode: store.countryCode,
          countryCodes: new Set(),
          country: null,
          stores: new Map(),
          children: new Set(),
          towns: new Set(),
        };
        drafts.set(slug, draft);
      } else if (rules.minStores < draft.minStores) {
        draft.minStores = rules.minStores;
      }
      if (store.countryCode) draft.countryCodes.add(store.countryCode);
      // Country is not a rung when that level is off, so the first member that has one wins:
      // the first member outright may not be enriched yet. Resolved to `null` after grouping
      // when the members turn out to span several countries.
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

  // Two countries can share a region name — Limburg, Tirol, Luxembourg. With the `country`
  // level off they fold into one slug. That the stores then share a page is by design (see
  // `Draft.minStores`); what is not, is the page ASSERTING one of the countries, picked from
  // whichever member happened to arrive first. Below, such an area carries no country at
  // all: no `admin.country`, no country rung opening the breadcrumb, no country in the copy.
  // Reported, not thrown — enabling the `country` level is the real fix, and it is a setup
  // decision, not something a nightly sync should die on.
  for (const [slug, draft] of kept) {
    if (draft.countryCodes.size <= 1) continue;
    const self = draft.trail[draft.trail.length - 1]!;
    report({
      kind: 'cross-country-area',
      name: self.name,
      level: self.level,
      detail:
        `\`${slug}\` holds stores from ${[...draft.countryCodes].sort().join(', ')}, so it names ` +
        'no country. Enable the `country` level in AreaConfig.levels to give each its own page.',
    });
  }

  const canonicalOf = orphanCanonicals(kept, report);

  const pages: AreaLocalPage[] = [];

  for (const draft of kept.values()) {
    const self = draft.trail[draft.trail.length - 1]!;
    const rules = rulesFor(draft.countryCode);
    // See the cross-country note above: one country's name on a page holding several is a
    // claim the data does not support, so the area names none.
    const country = draft.countryCodes.size > 1 ? null : draft.country;
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
      // Sorted: a Set keeps feed order, and Store Search does not promise one, so an
      // unsorted list rewrites the intro — and the metaobject — on every sync.
      towns: [...draft.towns].sort((a, b) => a.localeCompare(b)),
      country,
      region: at('region'),
      county: at('county'),
    };

    const noun = storeNoun(facts.storeCount, rules.intro);
    const absolute = canonicalUrl(config.origin, self.path);
    const ancestors = draft.trail.slice(0, -1).map((rung) => rung.name);
    // The country opens the breadcrumb even when that level has no page of its own. Never on
    // a country page, and never when a rung already carries the country's name: a breadcrumb
    // does not contain its own subject, and in Luxembourg or Monaco the top enabled rung IS
    // the country. Decided once and handed to both renderings, so they cannot drift apart.
    const leadingCountry =
      country && self.level !== 'country' && self.name !== country && ancestors[0] !== country
        ? country
        : null;
    const breadcrumb = leadingCountry ? [leadingCountry, ...ancestors] : ancestors;

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
      // `null`, not `{}`: the contract says AdminAreas | null, and `{}` is truthy, so a
      // consumer guarding on `if (page.admin)` would take the branch and write nothing.
      admin: adminOrNull({
        ...(country ? { country } : {}),
        ...(facts.region ? { region: facts.region } : {}),
        ...(facts.county ? { county: facts.county } : {}),
        ...(self.level === 'city' ? { city: self.name } : {}),
      }),
      breadcrumb,
      seo: buildAreaSeo(facts, config.brand, canonicalOf.get(self.slug) ?? self.path, rules.seo, noun),
      jsonLd: buildTrailJsonLd(draft.trail, config.origin, leadingCountry),
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

/** `{}` is not a resolved hierarchy; the contract says `null` for that. */
function adminOrNull(admin: AdminAreas): AdminAreas | null {
  return Object.keys(admin).length > 0 ? admin : null;
}

/**
 * Canonical paths for orphan areas, keyed by slug.
 *
 * A store with a county but no region forms its own root area rather than joining the
 * fuller one — inventing the missing rung would file it under a region nobody resolved,
 * and that call is deliberate. What it leaves behind is two indexable pages with
 * byte-identical SEO competing for the same name (`kent` and `england-kent`), which a
 * partial reverse-geocode makes the normal outcome rather than the rare one.
 *
 * So the stores stay where they are and only the canonical moves: the orphan declares the
 * fuller page canonical, and the index consolidates on one of them. Ambiguity is reported
 * instead — two fuller candidates means no single right target.
 */
function orphanCanonicals(
  kept: Map<string, Draft>,
  report: (problem: AreaProblem) => void,
): Map<string, string> {
  const canonical = new Map<string, string>();

  for (const draft of kept.values()) {
    if (draft.trail.length > 1) continue;
    const self = draft.trail[0]!;

    const fuller = [...kept.values()].filter((other) => {
      if (other === draft || other.trail.length < 2) return false;
      const rung = other.trail[other.trail.length - 1]!;
      return rung.level === self.level && rung.name === self.name;
    });

    if (fuller.length === 0) continue;
    if (fuller.length > 1) {
      report({
        kind: 'ambiguous-orphan',
        name: self.name,
        level: self.level,
        detail: `${fuller.length} fuller areas share this name, so no single canonical target exists. Both pages stay indexable.`,
      });
      continue;
    }

    const target = fuller[0]!.trail[fuller[0]!.trail.length - 1]!;
    canonical.set(self.slug, target.path);
    report({
      kind: 'orphan-canonicalised',
      name: self.name,
      level: self.level,
      detail: `stores here resolved no parent level, so \`${self.slug}\` points its canonical at \`${target.slug}\` rather than competing with it.`,
    });
  }

  return canonical;
}
