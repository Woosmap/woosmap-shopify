import { describe, expect, it } from 'vitest';
import { buildBreadcrumbJsonLd, buildLocalBusinessJsonLd } from '../src/json-ld';
import { makeStore, PARIS_ADMIN } from './fixtures';

describe('buildLocalBusinessJsonLd', () => {
  it('declares a LocalBusiness', () => {
    expect(buildLocalBusinessJsonLd(makeStore(), null)['@type']).toBe('LocalBusiness');
  });

  it('nests a PostalAddress', () => {
    const doc = buildLocalBusinessJsonLd(makeStore(), null);
    expect(doc.address).toMatchObject({
      '@type': 'PostalAddress',
      streetAddress: '27 Berkeley St',
      postalCode: '75008',
      addressLocality: 'Paris',
      addressCountry: 'FR',
    });
  });

  it('adds addressRegion when the admin data resolved one', () => {
    const doc = buildLocalBusinessJsonLd(makeStore(), PARIS_ADMIN);
    expect(doc.address).toMatchObject({ addressRegion: 'Île-de-France' });
  });

  it('omits addressRegion rather than emitting it empty', () => {
    const doc = buildLocalBusinessJsonLd(makeStore(), null);
    expect(doc.address).not.toHaveProperty('addressRegion');
  });

  it('adds geo coordinates as numbers', () => {
    const doc = buildLocalBusinessJsonLd(makeStore({ lat: 1.5, lng: 2.5 }), null);
    expect(doc.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 1.5, longitude: 2.5 });
  });

  it('omits geo when the store has no coordinates', () => {
    const doc = buildLocalBusinessJsonLd(makeStore({ lat: null, lng: null }), null);
    expect(doc).not.toHaveProperty('geo');
  });

  it('omits telephone when the store has none', () => {
    const doc = buildLocalBusinessJsonLd(makeStore({ phone: '' }), null);
    expect(doc).not.toHaveProperty('telephone');
  });
});

describe('buildBreadcrumbJsonLd', () => {
  const trail = ['France', 'Île-de-France', 'Paris'];

  it('declares a BreadcrumbList', () => {
    const doc = buildBreadcrumbJsonLd(trail, 'Berkeley Square', '/p', PARIS_ADMIN);
    expect(doc?.['@type']).toBe('BreadcrumbList');
  });

  it('appends the store as the last rung', () => {
    const doc = buildBreadcrumbJsonLd(trail, 'Berkeley Square', '/p', PARIS_ADMIN);
    const items = doc?.itemListElement as Array<Record<string, unknown>>;
    expect(items[items.length - 1]).toMatchObject({ position: 4, name: 'Berkeley Square' });
  });

  it('numbers positions from one', () => {
    const doc = buildBreadcrumbJsonLd(trail, 'X', '/p', PARIS_ADMIN);
    const items = doc?.itemListElement as Array<Record<string, unknown>>;
    expect(items.map((i) => i.position)).toEqual([1, 2, 3, 4]);
  });

  it('gives an item url only to the last rung, since area pages do not exist yet', () => {
    const doc = buildBreadcrumbJsonLd(trail, 'X', 'https://shop/p', PARIS_ADMIN);
    const items = doc?.itemListElement as Array<Record<string, unknown>>;
    expect(items.filter((i) => 'item' in i)).toEqual([
      { '@type': 'ListItem', position: 4, name: 'X', item: 'https://shop/p' },
    ]);
  });

  it('emits nothing when neither a region nor a county resolved', () => {
    expect(buildBreadcrumbJsonLd(['France'], 'X', '/p', { country: 'France' })).toBeNull();
  });

  it('emits nothing when there is no admin data at all', () => {
    expect(buildBreadcrumbJsonLd([], 'X', '/p', null)).toBeNull();
  });

  it('emits on a county alone', () => {
    expect(buildBreadcrumbJsonLd(['Kent'], 'X', '/p', { county: 'Kent' })).not.toBeNull();
  });
});
