import { describe, expect, it } from 'vitest';
import { buildStaticMap } from '../src/static-map';
import { makeStore } from './fixtures';

describe('buildStaticMap', () => {
  it('targets the Static Maps endpoint', () => {
    const map = buildStaticMap(makeStore(), 'woos-public');
    expect(map?.url.startsWith('https://api.woosmap.com/maps/static?')).toBe(true);
  });

  it('passes the public key', () => {
    const map = buildStaticMap(makeStore(), 'woos-public');
    expect(map?.url).toContain('key=woos-public');
  });

  it('encodes the marker as a JSON lat/lng object', () => {
    const map = buildStaticMap(makeStore({ lat: 1, lng: 2 }), 'k');
    expect(new URL(map!.url).searchParams.get('markers')).toBe('{"lat":1,"lng":2}');
  });

  it('uses the template defaults for zoom and geometry', () => {
    const map = buildStaticMap(makeStore(), 'k');
    const params = new URL(map!.url).searchParams;
    expect([params.get('zoom'), params.get('width'), params.get('height')]).toEqual([
      '15',
      '600',
      '400',
    ]);
  });

  it('reports the geometry alongside the url so a renderer can avoid layout shift', () => {
    const map = buildStaticMap(makeStore(), 'k');
    expect([map?.width, map?.height]).toEqual([600, 400]);
  });

  it('honours geometry overrides', () => {
    const map = buildStaticMap(makeStore(), 'k', { zoom: 11, width: 320, height: 200 });
    expect(new URL(map!.url).searchParams.get('zoom')).toBe('11');
  });

  it('honours an api base override', () => {
    const map = buildStaticMap(makeStore(), 'k', { apiBase: 'https://eu.example.com' });
    expect(map?.url.startsWith('https://eu.example.com/maps/static?')).toBe(true);
  });

  it('names the store in the alt text', () => {
    const map = buildStaticMap(makeStore({ name: 'Opéra' }), 'k');
    expect(map?.alt).toBe('Map showing the location of Opéra');
  });

  it('returns null without a public key, so a private key is never needed', () => {
    expect(buildStaticMap(makeStore(), undefined)).toBeNull();
  });

  it('returns null when the store has no latitude', () => {
    expect(buildStaticMap(makeStore({ lat: null }), 'k')).toBeNull();
  });

  it('returns null when the store has no longitude', () => {
    expect(buildStaticMap(makeStore({ lng: null }), 'k')).toBeNull();
  });
});
