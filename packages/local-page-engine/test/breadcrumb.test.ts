import { describe, expect, it } from 'vitest';
import { buildBreadcrumb } from '../src/breadcrumb';

describe('buildBreadcrumb', () => {
  it('orders the trail country → region → county → city', () => {
    expect(
      buildBreadcrumb({ country: 'France', region: 'Bretagne', county: 'Morbihan', city: 'Vannes' }),
    ).toEqual(['France', 'Bretagne', 'Morbihan', 'Vannes']);
  });

  it('drops consecutive duplicates (Paris is both county and city)', () => {
    expect(
      buildBreadcrumb({ country: 'France', region: 'Île-de-France', county: 'Paris', city: 'Paris' }),
    ).toEqual(['France', 'Île-de-France', 'Paris']);
  });

  it('collapses a city-state to a single rung', () => {
    expect(
      buildBreadcrumb({ country: 'Luxembourg', region: 'Luxembourg', city: 'Luxembourg' }),
    ).toEqual(['Luxembourg']);
  });

  it('keeps a non-consecutive repeat', () => {
    expect(buildBreadcrumb({ country: 'A', region: 'B', city: 'A' })).toEqual(['A', 'B', 'A']);
  });

  it('skips blank and whitespace-only levels', () => {
    expect(buildBreadcrumb({ country: 'France', region: '  ', city: 'Lille' })).toEqual([
      'France',
      'Lille',
    ]);
  });

  it('trims surrounding whitespace on the labels it keeps', () => {
    expect(buildBreadcrumb({ city: '  Lille  ' })).toEqual(['Lille']);
  });

  it('returns an empty trail when there is no admin data', () => {
    expect(buildBreadcrumb(null)).toEqual([]);
  });
});
