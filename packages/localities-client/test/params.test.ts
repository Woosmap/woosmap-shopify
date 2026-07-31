import { describe, it, expect } from 'vitest';
import { encodeComponents, encodeTypes, encodeLatLng } from '../src/params';

describe('encodeComponents', () => {
  it('encodes a country array to pipe-separated, preserving case (parity with maps-js source)', () => {
    expect(encodeComponents({ country: ['FR', 'GB'] })).toBe('country:FR|country:GB');
  });

  it('encodes a single country value', () => {
    expect(encodeComponents({ country: 'FR' })).toBe('country:FR');
  });

  it('returns null for undefined or empty input', () => {
    expect(encodeComponents(undefined)).toBeNull();
    expect(encodeComponents({})).toBeNull();
  });
});

describe('encodeTypes', () => {
  it('joins an array with a pipe', () => {
    expect(encodeTypes(['address', 'locality'])).toBe('address|locality');
  });

  it('passes a single string through unchanged', () => {
    expect(encodeTypes('address')).toBe('address');
  });

  it('returns null when absent or empty', () => {
    expect(encodeTypes(undefined)).toBeNull();
    expect(encodeTypes([])).toBeNull();
  });
});

describe('encodeLatLng', () => {
  it('formats a coordinate as "lat,lng"', () => {
    expect(encodeLatLng({ lat: 48.8566, lng: 2.3522 })).toBe('48.8566,2.3522');
  });

  it('encodes a LatLng-style instance (lat()/lng() methods)', () => {
    const latLng = { lat: () => 51.5074, lng: () => -0.1278 };
    expect(encodeLatLng(latLng as unknown as Parameters<typeof encodeLatLng>[0])).toBe('51.5074,-0.1278');
  });

  it('returns null when absent', () => {
    expect(encodeLatLng(undefined)).toBeNull();
  });
});
