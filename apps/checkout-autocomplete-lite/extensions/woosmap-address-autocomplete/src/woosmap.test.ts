import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalitiesClient } from '@woosmap/localities-client';
import type { Transport, TransportResponse } from '@woosmap/localities-client';
import { format, localitiesClient, suggest } from './woosmap';

function okResponse(json: unknown): TransportResponse {
  return { ok: true, status: 200, statusText: 'OK', json: async () => json };
}

/** A transport that records the URLs it is called with and returns a canned body. */
function recordingTransport(response: TransportResponse = okResponse({})) {
  const calls: string[] = [];
  const transport: Transport = async (url) => {
    calls.push(url);
    return response;
  };
  return { transport, calls };
}

function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

/** A client wired to a recording transport, with a deterministic session id. */
function clientWith(response?: TransportResponse) {
  const { transport, calls } = recordingTransport(response);
  const client = new LocalitiesClient({ key: 'pub', transport, sessionIdFactory: () => 'sess' });
  return { client, calls };
}

describe('localitiesClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns null when no public key is configured', () => {
    expect(localitiesClient(undefined)).toBeNull();
    expect(localitiesClient({})).toBeNull();
    expect(localitiesClient({ woosmap_public_key: '   ' })).toBeNull();
    // A non-string setting is ignored rather than coerced.
    expect(localitiesClient({ woosmap_public_key: 123 })).toBeNull();
  });

  it('builds a client when a key is present', () => {
    expect(localitiesClient({ woosmap_public_key: 'pub' })).toBeInstanceOf(LocalitiesClient);
  });

  it('trims the key and applies the default language to requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ localities: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = localitiesClient({ woosmap_public_key: '  pub-key  ', default_language: '  es  ' });
    expect(client).toBeInstanceOf(LocalitiesClient);
    await client!.autocomplete({ input: 'x' });

    const p = paramsOf(String(fetchMock.mock.calls[0]![0]));
    expect(p.get('key')).toBe('pub-key');
    expect(p.get('language')).toBe('es');
  });
});

describe('suggest', () => {
  const prediction = {
    public_id: 'pid-1',
    description: '5 Avenue Anatole France, Paris',
    matched_substrings: { description: [{ offset: 0, length: 1 }] },
  };

  it('requests address types with the country component and language, then maps predictions', async () => {
    const { client, calls } = clientWith(okResponse({ localities: [prediction] }));

    const suggestions = await suggest(client, '5 av', 'FR', 'fr', new AbortController().signal);

    const p = paramsOf(calls[0]!);
    expect(p.get('input')).toBe('5 av');
    expect(p.get('types')).toBe('address');
    expect(p.get('components')).toBe('country:FR');
    expect(p.get('language')).toBe('fr');
    expect(suggestions).toEqual([
      { id: 'pid-1', label: '5 Avenue Anatole France, Paris', matchedSubstrings: [{ offset: 0, length: 1 }] },
    ]);
  });

  it('omits the country component and language when neither is provided', async () => {
    const { client, calls } = clientWith(okResponse({ localities: [] }));

    const suggestions = await suggest(client, 'baker street', undefined, undefined, new AbortController().signal);

    const p = paramsOf(calls[0]!);
    expect(p.has('components')).toBe(false);
    expect(p.get('language')).toBeNull();
    expect(suggestions).toEqual([]);
  });
});

describe('format', () => {
  const result = {
    formatted_address: '5 Avenue Anatole France, 75007 Paris, France',
    address_components: [
      { types: ['postal_code'], long_name: '75007', short_name: '75007' },
      { types: ['locality'], long_name: 'Paris', short_name: 'Paris' },
      { types: ['country'], long_name: 'France', short_name: 'FR' },
    ],
  };

  it('resolves a suggestion id to a formatted address, forwarding the language', async () => {
    const { client, calls } = clientWith(okResponse({ result }));

    const address = await format(client, 'pid-1', 'fr');

    const p = paramsOf(calls[0]!);
    expect(p.get('public_id')).toBe('pid-1');
    expect(p.get('language')).toBe('fr');
    expect(address).toMatchObject({ zip: '75007', city: 'Paris', countryCode: 'FR' });
  });

  it('omits the language when none is provided', async () => {
    const { client, calls } = clientWith(okResponse({ result }));

    await format(client, 'pid-1', undefined);

    expect(paramsOf(calls[0]!).get('language')).toBeNull();
  });
});
