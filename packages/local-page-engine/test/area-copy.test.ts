import { describe, it, expect } from 'vitest';
import {
  buildAreaIntro,
  buildAreaSeo,
  sentenceList,
  DEFAULT_AREA_INTRO,
  DEFAULT_AREA_SEO,
} from '../src/area-copy';
import type { AreaFacts } from '../src/types';

function facts(overrides: Partial<AreaFacts> = {}): AreaFacts {
  return {
    name: 'Oxfordshire',
    levelLabel: 'County',
    storeCount: 6,
    children: [],
    towns: ['Oxford', 'Banbury'],
    country: 'United Kingdom',
    region: 'England',
    county: 'Oxfordshire',
    ...overrides,
  };
}

describe('sentenceList', () => {
  it('joins with commas and a conjunction', () => {
    expect(sentenceList(['a', 'b', 'c'], 'and')).toBe('a, b and c');
  });

  it('leaves one item alone', () => {
    expect(sentenceList(['a'], 'and')).toBe('a');
  });

  it('returns an empty string for no item', () => {
    expect(sentenceList([], 'and')).toBe('');
  });
});

describe('buildAreaIntro', () => {
  it('names the towns of a leaf area', () => {
    expect(buildAreaIntro(facts(), undefined, DEFAULT_AREA_INTRO)).toBe(
      'You will find 6 stores in Oxfordshire, in Oxford and Banbury.',
    );
  });

  it('weaves the brand in', () => {
    expect(buildAreaIntro(facts(), 'Poundland', DEFAULT_AREA_INTRO)).toBe(
      'You will find 6 Poundland stores in Oxfordshire, in Oxford and Banbury.',
    );
  });

  it('uses the singular noun for one store', () => {
    const one = facts({ storeCount: 1, towns: ['Oxford'] });
    expect(buildAreaIntro(one, undefined, DEFAULT_AREA_INTRO)).toContain('1 store in');
  });

  it('names the biggest children rather than the towns when there are children', () => {
    const region = facts({
      name: 'England',
      storeCount: 413,
      towns: ['Oxford', 'Banbury', 'Salford'],
      children: [
        { name: 'Oxfordshire', storeCount: 6 },
        { name: 'Greater London', storeCount: 53 },
        { name: 'Greater Manchester', storeCount: 27 },
        { name: 'Cornwall', storeCount: 2 },
      ],
    });
    expect(buildAreaIntro(region, undefined, DEFAULT_AREA_INTRO)).toBe(
      'You will find 413 stores in England, including 53 in Greater London, 27 in Greater Manchester and 6 in Oxfordshire.',
    );
  });

  it('breaks a tie between children by name, so the copy does not move between runs', () => {
    const region = facts({
      children: [
        { name: 'Bravo', storeCount: 4 },
        { name: 'Alpha', storeCount: 4 },
      ],
    });
    expect(buildAreaIntro(region, undefined, DEFAULT_AREA_INTRO)).toContain(
      '4 in Alpha and 4 in Bravo',
    );
  });

  it('summarises the tail when there are more towns than it names', () => {
    const many = facts({ towns: ['A', 'B', 'C', 'D', 'E', 'F'] });
    expect(buildAreaIntro(many, undefined, DEFAULT_AREA_INTRO)).toBe(
      'You will find 6 stores in Oxfordshire, in A, B, C and 3 more towns.',
    );
  });

  it('does not name a town that is the area itself', () => {
    const city = facts({ name: 'Oxford', towns: ['Oxford'] });
    expect(buildAreaIntro(city, undefined, DEFAULT_AREA_INTRO)).toBe(
      'You will find 6 stores in Oxford.',
    );
  });

  it('takes overridden templates, so a non-English network is a tuning job', () => {
    const fr = {
      ...DEFAULT_AREA_INTRO,
      withTowns: 'Retrouvez {count} {noun} {brand} en {area}, à {list}.',
      storeNoun: 'magasin',
      storeNounPlural: 'magasins',
      conjunction: 'et',
    };
    expect(buildAreaIntro(facts({ name: 'Gironde' }), 'Acme', fr)).toBe(
      'Retrouvez 6 magasins Acme en Gironde, à Oxford et Banbury.',
    );
  });
});

describe('buildAreaSeo', () => {
  it('builds the title, description and canonical path', () => {
    const seo = buildAreaSeo(
      facts(),
      'Poundland',
      '/pages/regions/england-oxfordshire',
      DEFAULT_AREA_SEO,
      'stores',
    );
    expect(seo).toEqual({
      title: 'Poundland stores in Oxfordshire | 6 locations',
      description:
        'Every Poundland store in Oxfordshire: addresses, opening hours, phone numbers and directions.',
      canonicalPath: '/pages/regions/england-oxfordshire',
      imageAlt: 'Map showing the location of Oxfordshire',
    });
  });

  it('leaves no debris when there is no brand', () => {
    const seo = buildAreaSeo(facts(), undefined, '/x', DEFAULT_AREA_SEO, 'stores');
    expect(seo.title).toBe('stores in Oxfordshire | 6 locations');
  });

  it('substitutes the level label and the hierarchy', () => {
    const templates = { ...DEFAULT_AREA_SEO, title: '{area} ({level}), {region}, {country}' };
    expect(buildAreaSeo(facts(), undefined, '/x', templates, 'stores').title).toBe(
      'Oxfordshire (County), England, United Kingdom',
    );
  });
});
