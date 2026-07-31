import { describe, it, expect } from 'vitest';
import { mapDetailsToFormattedAddress, predictionToSuggestion } from '../src/address-mapping';
import type { MappableDetails } from '../src/address-mapping';
import type { LocalitiesPrediction } from '../src/types';

function component(types: string[], long_name: string, short_name = long_name) {
  return { types, long_name, short_name };
}

describe('mapDetailsToFormattedAddress — France', () => {
  it('maps a French address, using street components for the line and ISO codes for country', () => {
    const result: MappableDetails = {
      formatted_address: '20 Rue de la Paix, 75002 Paris, France',
      address_components: [
        component(['route'], 'Rue de la Paix'),
        component(['street_number'], '20'),
        component(['locality'], 'Paris'),
        component(['postal_code'], '75002'),
        component(['country'], 'France', 'FR'),
      ],
    };

    const address = mapDetailsToFormattedAddress(result, { country: 'FR' });

    expect(address.city).toBe('Paris');
    expect(address.zip).toBe('75002');
    expect(address.countryCode).toBe('FR');
    expect(address.address1).toContain('Rue de la Paix');
    expect(address.address1).not.toContain('Paris');
    expect(address.address1).not.toContain('France');
  });

  it('falls back to the first formatted segment when no street component is present', () => {
    const result: MappableDetails = {
      formatted_address: '20 Rue de la Paix, 75002 Paris, France',
      address_components: [
        component(['locality'], 'Paris'),
        component(['postal_code'], '75002'),
        component(['country'], 'France', 'FR'),
      ],
    };

    const address = mapDetailsToFormattedAddress(result, { country: 'FR' });

    expect(address.address1).toBe('20 Rue de la Paix');
    expect(address.city).toBe('Paris');
  });
});

describe('mapDetailsToFormattedAddress — United Kingdom (postal_town / London edge)', () => {
  it('uses postal_town as the city and keeps the locality (neighbourhood) in the street line', () => {
    const result: MappableDetails = {
      formatted_address: 'Carnaby Street, Soho, London, W1F 9PB, United Kingdom',
      address_components: [
        component(['route'], 'Carnaby Street'),
        component(['locality'], 'Soho'),
        component(['postal_town'], 'London'),
        component(['postal_code'], 'W1F 9PB'),
        component(['country'], 'United Kingdom', 'GB'),
      ],
    };

    const address = mapDetailsToFormattedAddress(result, { country: 'GB' });

    expect(address.city).toBe('London');
    expect(address.zip).toBe('W1F 9PB');
    expect(address.countryCode).toBe('GB');
    expect(address.address1).toContain('Carnaby Street');
    expect(address.address1).toContain('Soho');
  });
});

describe('mapDetailsToFormattedAddress — province and premise', () => {
  it('emits the province short code and puts premise in address2', () => {
    const result: MappableDetails = {
      formatted_address: '1600 Amphitheatre Parkway, Mountain View, CA 94043, USA',
      address_components: [
        component(['route'], 'Amphitheatre Parkway'),
        component(['street_number'], '1600'),
        component(['premise'], 'Building 40'),
        component(['locality'], 'Mountain View'),
        component(['state'], 'California', 'CA'),
        component(['postal_code'], '94043'),
        component(['country'], 'United States', 'US'),
      ],
    };

    const address = mapDetailsToFormattedAddress(result, { country: 'US' });

    expect(address.provinceCode).toBe('CA');
    expect(address.address2).toBe('Building 40');
    expect(address.city).toBe('Mountain View');
    expect(address.countryCode).toBe('US');
  });

  it('uses county as province only when no state is present', () => {
    const result: MappableDetails = {
      formatted_address: 'High Street, Oxford, OX1, United Kingdom',
      address_components: [
        component(['route'], 'High Street'),
        component(['postal_town'], 'Oxford'),
        component(['county'], 'Oxfordshire', 'OXF'),
        component(['postal_code'], 'OX1'),
        component(['country'], 'United Kingdom', 'GB'),
      ],
    };

    expect(mapDetailsToFormattedAddress(result).provinceCode).toBe('OXF');
  });
});

describe('mapDetailsToFormattedAddress — array-valued component names (official type allows string[])', () => {
  it('normalises string[] long_name / short_name to the first value', () => {
    const result: MappableDetails = {
      formatted_address: 'Main Road, Springfield, 00000, Country',
      address_components: [
        component(['route'], 'Main Road'),
        { types: ['locality'], long_name: ['Springfield', 'Springfield City'], short_name: ['Springfield'] },
        { types: ['country'], long_name: ['Country'], short_name: ['CO'] },
      ],
    };

    const address = mapDetailsToFormattedAddress(result);
    expect(address.city).toBe('Springfield');
    expect(address.countryCode).toBe('CO');
  });
});

describe('mapDetailsToFormattedAddress — resilience', () => {
  it('returns empty fields (bar the fallback country) for an empty result', () => {
    const address = mapDetailsToFormattedAddress({}, { country: 'FR' });
    expect(address).toEqual({
      address1: '',
      address2: '',
      city: '',
      zip: '',
      provinceCode: '',
      countryCode: 'FR',
    });
  });

  it('lets a country component override the fallback country', () => {
    const result: MappableDetails = {
      formatted_address: 'Somewhere',
      address_components: [component(['country'], 'Belgium', 'BE')],
    };
    expect(mapDetailsToFormattedAddress(result, { country: 'FR' }).countryCode).toBe('BE');
  });

  it('does not break on component values containing regex metacharacters', () => {
    const result: MappableDetails = {
      formatted_address: 'Rue (test) *étoile*, 75000 Paris, France',
      address_components: [
        component(['route'], 'Rue (test) *étoile*'),
        component(['locality'], 'Paris'),
        component(['country'], 'France', 'FR'),
      ],
    };
    expect(() => mapDetailsToFormattedAddress(result, { country: 'FR' })).not.toThrow();
  });
});

describe('mapDetailsToFormattedAddress — FR postal_town edge', () => {
  it('drops a locality entirely when a postal_town is present for FR', () => {
    const result: MappableDetails = {
      formatted_address: 'Rue X, Quartier, Ville, 75000, France',
      address_components: [
        component(['route'], 'Rue X'),
        component(['locality'], 'Quartier'),
        component(['postal_town'], 'Ville'),
        component(['postal_code'], '75000'),
        component(['country'], 'France', 'FR'),
      ],
    };

    const address = mapDetailsToFormattedAddress(result, { country: 'FR' });
    expect(address.city).toBe('Ville');
    expect(address.address1).not.toContain('Quartier');
  });
});

describe('predictionToSuggestion', () => {
  it('maps public_id, description and matched substrings (from matched_substrings.description)', () => {
    const prediction: LocalitiesPrediction = {
      public_id: 'pid-1',
      description: '20 Rue de la Paix, Paris',
      matched_substrings: { description: [{ offset: 0, length: 2 }] },
    };

    expect(predictionToSuggestion(prediction)).toEqual({
      id: 'pid-1',
      label: '20 Rue de la Paix, Paris',
      matchedSubstrings: [{ offset: 0, length: 2 }],
    });
  });

  it('defaults label and matchedSubstrings when absent', () => {
    const prediction: LocalitiesPrediction = { public_id: 'pid-2' };
    expect(predictionToSuggestion(prediction)).toEqual({
      id: 'pid-2',
      label: '',
      matchedSubstrings: [],
    });
  });
});
