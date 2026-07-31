import { describe, it, expect } from 'vitest';
import {
  encodeAutocompleteParams,
  encodeBoundsParams,
  encodeSearchParams,
  transformLatLng,
} from '../src/params';

describe('transformLatLng', () => {
  it('reads literal lat/lng', () => {
    expect(transformLatLng({ lat: 48.8, lng: 2.3 })).toEqual({ lat: 48.8, lng: 2.3 });
  });

  it('reads accessor-style lat/lng (maps-js LatLng)', () => {
    expect(transformLatLng({ lat: () => 1, lng: () => 2 })).toEqual({ lat: 1, lng: 2 });
  });
});

describe('encodeSearchParams', () => {
  it('maps camelCase request fields onto snake_case params', () => {
    const params = encodeSearchParams({
      query: 'type:"grocery"',
      latLng: { lat: 48.8566, lng: 2.3522 },
      radius: 5000,
      storesByPage: 300,
      page: 2,
      zone: true,
    });
    expect(params.get('query')).toBe('type:"grocery"');
    expect(params.get('lat')).toBe('48.8566');
    expect(params.get('lng')).toBe('2.3522');
    expect(params.get('radius')).toBe('5000');
    expect(params.get('stores_by_page')).toBe('300');
    expect(params.get('page')).toBe('2');
    expect(params.get('zone')).toBe('true');
  });

  it('percent-encodes the query syntax', () => {
    const params = encodeSearchParams({ query: 'last_updated:>="2026-01-01T00:00:00"' });
    expect(params.toString()).toContain('last_updated%3A%3E%3D');
  });

  it('omits absent, empty, and falsey-zone params', () => {
    const params = encodeSearchParams({ query: '', zone: false });
    expect([...params.keys()]).toEqual([]);
  });

  it('passes a pre-encoded polyline through as the REST `encoded_polyline` param', () => {
    const params = encodeSearchParams({ polyline: '_p~iF~ps|U' });
    expect(params.get('encoded_polyline')).toBe('_p~iF~ps|U');
    expect(params.get('polyline')).toBeNull();
  });
});

describe('encodeAutocompleteParams', () => {
  it('encodes query, language, and limit', () => {
    const params = encodeAutocompleteParams({ query: 'name:"cool"', language: 'fr', limit: 10 });
    expect(params.get('query')).toBe('name:"cool"');
    expect(params.get('language')).toBe('fr');
    expect(params.get('limit')).toBe('10');
  });
});

describe('encodeBoundsParams', () => {
  it('encodes query, lat/lng, and radius', () => {
    const params = encodeBoundsParams({ query: 'tag:"x"', latLng: { lat: 1, lng: 2 }, radius: 100 });
    expect(params.get('query')).toBe('tag:"x"');
    expect(params.get('lat')).toBe('1');
    expect(params.get('lng')).toBe('2');
    expect(params.get('radius')).toBe('100');
  });
});
