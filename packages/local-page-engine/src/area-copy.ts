import { applyTemplate } from './seo';
import type {
  AreaFacts,
  AreaIntroTemplates,
  AreaLevel,
  AreaSeoTemplates,
  PageSeo,
} from './types';

/** English level names. A network outside the UK overrides these per country. */
export const DEFAULT_AREA_LEVEL_LABELS: Record<AreaLevel, string> = {
  country: 'Country',
  region: 'Region',
  county: 'County',
  city: 'Town',
};

/** Default intro copy. English, like the store-page templates. */
export const DEFAULT_AREA_INTRO: AreaIntroTemplates = {
  base: 'You will find {count} {brand} {noun} in {area}.',
  withChildren: 'You will find {count} {brand} {noun} in {area}, including {list}.',
  withTowns: 'You will find {count} {brand} {noun} in {area}, in {list}.',
  withMoreTowns:
    'You will find {count} {brand} {noun} in {area}, in {list} and {rest} more towns.',
  childItem: '{count} in {name}',
  storeNoun: 'store',
  storeNounPlural: 'stores',
  conjunction: 'and',
};

/** Default SEO copy for an area page. */
export const DEFAULT_AREA_SEO: AreaSeoTemplates = {
  title: '{brand} {noun} in {area} | {count} {noun}',
  description:
    'Every {brand} store in {area}: addresses, opening hours, phone numbers and directions.',
  mapAlt: 'Map showing the location of {name}',
};

/** How many children or towns the copy names before it summarises the rest. */
const MAX_NAMED_CHILDREN = 3;
const MAX_NAMED_TOWNS = 4;

/** Join a list the way a sentence does: `a, b and c`. */
export function sentenceList(parts: string[], conjunction: string): string {
  if (parts.length <= 1) {
    return parts[0] ?? '';
  }
  return `${parts.slice(0, -1).join(', ')} ${conjunction} ${parts[parts.length - 1]}`;
}

/** Placeholder values, `{noun}` aside: each caller adds that one. */
function areaValues(facts: AreaFacts, brand: string | undefined): Record<string, string> {
  return {
    area: facts.name,
    level: facts.levelLabel,
    count: String(facts.storeCount),
    brand: brand ?? '',
    country: facts.country ?? '',
    region: facts.region ?? '',
    county: facts.county ?? '',
  };
}

/**
 * One sentence of intro copy from the area's own facts, which is what keeps these pages
 * from reading as the same boilerplate N times. An area with children names its biggest
 * children; a leaf names its towns.
 */
export function buildAreaIntro(
  facts: AreaFacts,
  brand: string | undefined,
  templates: AreaIntroTemplates,
): string {
  const values = { ...areaValues(facts, brand), noun: storeNoun(facts.storeCount, templates) };

  if (facts.children.length > 0) {
    // Tie-break by name so the copy is stable between runs.
    const biggest = [...facts.children]
      .sort((a, b) => b.storeCount - a.storeCount || a.name.localeCompare(b.name))
      .slice(0, MAX_NAMED_CHILDREN)
      .map((child) =>
        applyTemplate(templates.childItem, { count: String(child.storeCount), name: child.name }),
      );
    return applyTemplate(templates.withChildren, {
      ...values,
      list: sentenceList(biggest, templates.conjunction),
    });
  }

  // A city area's only town is itself, so naming it would read "in Oxford, in Oxford".
  const towns = facts.towns.filter((town) => town !== facts.name);
  if (towns.length === 0) {
    return applyTemplate(templates.base, values);
  }
  if (towns.length <= MAX_NAMED_TOWNS) {
    return applyTemplate(templates.withTowns, {
      ...values,
      list: sentenceList(towns, templates.conjunction),
    });
  }
  const named = towns.slice(0, MAX_NAMED_TOWNS - 1);
  return applyTemplate(templates.withMoreTowns, {
    ...values,
    list: named.join(', '),
    rest: String(towns.length - named.length),
  });
}

/** The SEO block for one area page. */
export function buildAreaSeo(
  facts: AreaFacts,
  brand: string | undefined,
  path: string,
  templates: AreaSeoTemplates,
  noun: string,
): PageSeo {
  const values = { ...areaValues(facts, brand), noun };

  return {
    title: applyTemplate(templates.title, values),
    description: applyTemplate(templates.description, values),
    canonicalPath: path,
    imageAlt: applyTemplate(templates.mapAlt, { name: facts.name }),
  };
}

/** The noun the copy uses for this many stores. One rule, so the intro and the title agree. */
export function storeNoun(count: number, templates: AreaIntroTemplates): string {
  return count === 1 ? templates.storeNoun : templates.storeNounPlural;
}
