import { describe, expect, it } from 'vitest';
import { MAX_SLUG, areaSlug, canonicalPath, canonicalUrl, childSlug, storeSlug } from '../src/slug';

describe('storeSlug', () => {
  it('lower-cases the store id', () => {
    expect(storeSlug('FR-0421')).toBe('fr-0421');
  });

  it('keeps underscores and hyphens', () => {
    expect(storeSlug('a_b-c')).toBe('a_b-c');
  });

  it('collapses a run of disallowed characters to a single hyphen', () => {
    expect(storeSlug('store // 42')).toBe('store-42');
  });

  it('trims leading and trailing hyphens', () => {
    expect(storeSlug('  42  ')).toBe('42');
  });

  it('caps the slug at 255 characters', () => {
    expect(storeSlug('a'.repeat(300))).toHaveLength(255);
  });

  it('returns an empty slug when nothing survives', () => {
    expect(storeSlug('///')).toBe('');
  });
});

describe('canonicalPath', () => {
  it('joins the base and the slug', () => {
    expect(canonicalPath('/pages/stores', 'fr-0421')).toBe('/pages/stores/fr-0421');
  });

  it('adds the leading slash when the base has none', () => {
    expect(canonicalPath('pages/stores', 'x')).toBe('/pages/stores/x');
  });

  it('collapses duplicate slashes', () => {
    expect(canonicalPath('//pages//stores', 'x')).toBe('/pages/stores/x');
  });

  it('drops a trailing slash on the base', () => {
    expect(canonicalPath('/pages/stores/', 'x')).toBe('/pages/stores/x');
  });
});

describe('canonicalUrl', () => {
  it('joins the origin and the path', () => {
    expect(canonicalUrl('https://shop.example.com', '/pages/stores/x')).toBe(
      'https://shop.example.com/pages/stores/x',
    );
  });

  it('drops a trailing slash on the origin rather than doubling it', () => {
    expect(canonicalUrl('https://shop.example.com/', '/pages/stores/x')).toBe(
      'https://shop.example.com/pages/stores/x',
    );
  });

  it('returns null without an origin, so a relative path is never passed off as absolute', () => {
    expect(canonicalUrl(undefined, '/pages/stores/x')).toBeNull();
  });

  it('treats a blank origin as no origin', () => {
    expect(canonicalUrl('   ', '/pages/stores/x')).toBeNull();
  });
});

describe('areaSlug: letters with no NFD decomposition', () => {
  // These are permanent URLs, so each mangled name below cost a redirect forever.
  it.each([
    ['Łódzkie', 'lodzkie'],
    ['Trøndelag', 'trondelag'],
    ['Sjælland', 'sjaelland'],
    ['Großpösna', 'grossposna'],
    ['Bartın', 'bartin'],
    ['Ísafjörður', 'isafjordur'],
    ['Þingeyjarsveit', 'thingeyjarsveit'],
    ['Ærø', 'aero'],
    ['Ostrów Wielkopolski', 'ostrow-wielkopolski'],
  ])('folds %s to %s', (name, expected) => {
    expect(areaSlug(name)).toBe(expected);
  });

  it('still folds the decomposable accents it always did', () => {
    expect(areaSlug('Île-de-France')).toBe('ile-de-france');
    expect(areaSlug('Côte-d’Or')).toBe('cote-d-or');
    expect(areaSlug('Bath & North East Somerset')).toBe('bath-and-north-east-somerset');
  });

  it('gives up on a non-Latin script rather than guessing a transliteration', () => {
    expect(areaSlug('Αττική')).toBe('');
    expect(areaSlug('Москва')).toBe('');
  });

  it('never ends on a separator, even when the cap lands mid-word', () => {
    const slug = areaSlug(`${'a'.repeat(254)} bcd`);
    expect(slug).toHaveLength(254);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('childSlug', () => {
  it('carries the parent, so two same-named counties stay apart', () => {
    expect(childSlug('england', 'kent')).toBe('england-kent');
    expect(childSlug('england', 'kent')).not.toBe(childSlug('wales', 'kent'));
  });

  it('keeps siblings distinct when the join has to be truncated', () => {
    const parent = 'x'.repeat(250);
    const a = childSlug(parent, 'alpha');
    const b = childSlug(parent, 'beta');
    // The bug: both used to slice back to the parent, so a child became its own parent.
    expect(a).not.toBe(parent);
    expect(b).not.toBe(parent);
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(MAX_SLUG);
  });

  it('is deterministic, because the slug is the URL', () => {
    const parent = 'y'.repeat(250);
    expect(childSlug(parent, 'gwynedd')).toBe(childSlug(parent, 'gwynedd'));
  });
});
