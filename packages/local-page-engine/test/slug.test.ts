import { describe, expect, it } from 'vitest';
import { canonicalPath, storeSlug } from '../src/slug';

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
