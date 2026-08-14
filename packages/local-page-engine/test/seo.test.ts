import { describe, expect, it } from 'vitest';
import { applyTemplate, buildSeo, DEFAULT_SEO_TEMPLATES, seoValues } from '../src/seo';
import { makeStore, PARIS_ADMIN } from './fixtures';

describe('applyTemplate', () => {
  it('substitutes placeholders', () => {
    expect(applyTemplate('{a} and {b}', { a: 'x', b: 'y' })).toBe('x and y');
  });

  it('treats an unknown placeholder as empty', () => {
    expect(applyTemplate('{a}{missing}', { a: 'x' })).toBe('x');
  });

  it('drops a trailing separator left by an empty tail value', () => {
    expect(applyTemplate('{name} — {city}', { name: 'Berkeley', city: '' })).toBe('Berkeley');
  });

  it('collapses separators left by an empty middle value', () => {
    expect(applyTemplate('{name} — {city} | {brand}', { name: 'X', city: '', brand: 'Acme' })).toBe(
      'X — Acme',
    );
  });

  it('drops a leading separator left by an empty head value', () => {
    expect(applyTemplate('{brand} | {name}', { brand: '', name: 'X' })).toBe('X');
  });

  it('removes a comma that ends up against a full stop', () => {
    expect(applyTemplate('{name}, {zip} {city}. Next.', { name: 'X', zip: '', city: '' })).toBe(
      'X. Next.',
    );
  });

  it('collapses whitespace runs', () => {
    expect(applyTemplate('{a}   {b}', { a: 'x', b: 'y' })).toBe('x y');
  });

  it('returns an empty string when every value is missing', () => {
    expect(applyTemplate('{a} — {b}', { a: '', b: '' })).toBe('');
  });
});

describe('seoValues', () => {
  it('falls back to the admin city when the store carries none', () => {
    const values = seoValues(makeStore({ city: '' }), PARIS_ADMIN, undefined);
    expect(values.city).toBe('Paris');
  });

  it('exposes an empty brand rather than undefined when unconfigured', () => {
    expect(seoValues(makeStore(), null, undefined).brand).toBe('');
  });

  it('exposes the admin region', () => {
    expect(seoValues(makeStore(), PARIS_ADMIN, 'Acme').region).toBe('Île-de-France');
  });
});

describe('buildSeo', () => {
  it('builds the default title from name, city and brand', () => {
    const seo = buildSeo(makeStore(), PARIS_ADMIN, '/pages/stores/fr-0421', 'Acme');
    expect(seo.title).toBe('Berkeley Square — Paris | Acme');
  });

  it('keeps the title readable when no brand is configured', () => {
    const seo = buildSeo(makeStore(), PARIS_ADMIN, '/p', undefined);
    expect(seo.title).toBe('Berkeley Square — Paris');
  });

  it('carries the canonical path through untouched', () => {
    const seo = buildSeo(makeStore(), null, '/pages/stores/fr-0421', 'Acme');
    expect(seo.canonicalPath).toBe('/pages/stores/fr-0421');
  });

  it('describes the store with its address', () => {
    const seo = buildSeo(makeStore(), PARIS_ADMIN, '/p', 'Acme');
    expect(seo.description).toContain('27 Berkeley St');
  });

  it('names the store in the image alt text', () => {
    const seo = buildSeo(makeStore(), null, '/p', undefined);
    expect(seo.imageAlt).toBe('Map showing the location of Berkeley Square');
  });

  it('accepts a template override', () => {
    const seo = buildSeo(makeStore(), null, '/p', 'Acme', { title: '{brand}: {name}' });
    expect(seo.title).toBe('Acme: Berkeley Square');
  });

  it('exposes the defaults so an adapter can document them', () => {
    expect(DEFAULT_SEO_TEMPLATES.title).toContain('{name}');
  });
});
