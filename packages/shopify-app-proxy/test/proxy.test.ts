import { describe, it, expect } from 'vitest';
import { LocalitiesClient } from '@woosmap/localities-client';
import type { Transport, TransportResponse } from '@woosmap/localities-client';
import { LocalitiesProxy } from '../src/proxy';

function okResponse(json: unknown): TransportResponse {
  return { ok: true, status: 200, statusText: 'OK', json: async () => json };
}

/** Build a proxy over a client whose transport always returns `json`. */
function proxyReturning(json: unknown): { proxy: LocalitiesProxy; calls: string[] } {
  const calls: string[] = [];
  const transport: Transport = async (url) => {
    calls.push(url);
    return okResponse(json);
  };
  const client = new LocalitiesClient({ key: 'k', sessionIdFactory: () => 'sess', transport });
  return { proxy: new LocalitiesProxy(client), calls };
}

describe('LocalitiesProxy.suggest', () => {
  it('maps Localities predictions to Shopify suggestions', async () => {
    const { proxy } = proxyReturning({
      localities: [
        { public_id: 'p1', description: '20 Rue de la Paix, Paris', matched_substrings: { description: [{ offset: 0, length: 2 }] } },
        { public_id: 'p2', description: '20 Avenue Foch, Paris' },
      ],
    });

    const result = await proxy.suggest({ query: '20', country: 'FR', language: 'fr' });

    expect(result.suggestions).toEqual([
      { id: 'p1', label: '20 Rue de la Paix, Paris', matchedSubstrings: [{ offset: 0, length: 2 }] },
      { id: 'p2', label: '20 Avenue Foch, Paris', matchedSubstrings: [] },
    ]);
  });

  it('passes the country filter through as a Localities component', async () => {
    const { proxy, calls } = proxyReturning({ localities: [] });
    await proxy.suggest({ query: 'baker', country: 'GB' });
    expect(new URL(calls[0]!).searchParams.get('components')).toBe('country:GB');
  });

  it('short-circuits an empty query without calling the API', async () => {
    const { proxy, calls } = proxyReturning({ localities: [] });
    const result = await proxy.suggest({ query: '   ' });
    expect(result.suggestions).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('omits the country component when none is supplied', async () => {
    const { proxy, calls } = proxyReturning({ localities: [] });
    await proxy.suggest({ query: 'baker' });
    expect(new URL(calls[0]!).searchParams.has('components')).toBe(false);
  });
});

describe('LocalitiesProxy.format', () => {
  it('resolves a selection to a Shopify formatted address', async () => {
    const { proxy } = proxyReturning({
      result: {
        formatted_address: '20 Rue de la Paix, 75002 Paris, France',
        address_components: [
          { types: ['route'], long_name: 'Rue de la Paix', short_name: 'Rue de la Paix' },
          { types: ['street_number'], long_name: '20', short_name: '20' },
          { types: ['locality'], long_name: 'Paris', short_name: 'Paris' },
          { types: ['postal_code'], long_name: '75002', short_name: '75002' },
          { types: ['country'], long_name: 'France', short_name: 'FR' },
        ],
      },
    });

    const result = await proxy.format({ id: 'p1', country: 'FR' });

    expect(result.formattedAddress.city).toBe('Paris');
    expect(result.formattedAddress.zip).toBe('75002');
    expect(result.formattedAddress.countryCode).toBe('FR');
    expect(result.formattedAddress.address1).toContain('Rue de la Paix');
  });

  it('resolves without a country hint (uses the country component from the result)', async () => {
    const { proxy } = proxyReturning({
      result: {
        formatted_address: 'Baker Street, London, NW1, United Kingdom',
        address_components: [
          { types: ['route'], long_name: 'Baker Street', short_name: 'Baker Street' },
          { types: ['postal_town'], long_name: 'London', short_name: 'London' },
          { types: ['country'], long_name: 'United Kingdom', short_name: 'GB' },
        ],
      },
    });

    const result = await proxy.format({ id: 'p9' });
    expect(result.formattedAddress.city).toBe('London');
    expect(result.formattedAddress.countryCode).toBe('GB');
  });

  it('throws when no id is provided', async () => {
    const { proxy } = proxyReturning({ result: {} });
    await expect(proxy.format({ id: '' })).rejects.toThrow(/id/);
  });
});
