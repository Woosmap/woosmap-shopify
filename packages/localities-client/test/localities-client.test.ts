import { describe, it, expect } from 'vitest';
import { LocalitiesClient } from '../src/localities-client';
import type { LocalitiesClientOptions } from '../src/localities-client';
import { WoosmapApiError, WoosmapRequestError } from '../src/errors';
import type { Transport, TransportResponse } from '../src/transport';

function okResponse(json: unknown): TransportResponse {
  return { ok: true, status: 200, statusText: 'OK', json: async () => json };
}

function errResponse(status: number, json: unknown): TransportResponse {
  return { ok: false, status, statusText: 'Error', json: async () => json };
}

/** A transport that records every URL it is called with. */
function recordingTransport(response: TransportResponse = okResponse({})) {
  const calls: string[] = [];
  const transport: Transport = async (url) => {
    calls.push(url);
    return response;
  };
  return { transport, calls };
}

/** Client with a deterministic, monotonically increasing session id. */
function makeClient(overrides: LocalitiesClientOptions = {}) {
  let n = 0;
  return new LocalitiesClient({
    key: 'woos-test',
    sessionIdFactory: () => `session-${n++}`,
    ...overrides,
  });
}

function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe('LocalitiesClient.autocomplete', () => {
  it('builds the request path, key, input and mirrored params', async () => {
    const { transport, calls } = recordingTransport(okResponse({ localities: [] }));
    const client = makeClient({ transport });

    await client.autocomplete({
      input: '20 rue de la',
      components: { country: ['FR'] },
      types: ['address'],
      language: 'fr',
    });

    const url = new URL(calls[0]!);
    const p = url.searchParams;
    expect(url.pathname).toBe('/localities/autocomplete/');
    expect(p.get('key')).toBe('woos-test');
    expect(p.get('input')).toBe('20 rue de la');
    expect(p.get('components')).toBe('country:FR');
    expect(p.get('types')).toBe('address');
    expect(p.get('language')).toBe('fr');
    expect(p.get('no_deprecated_fields')).toBe('true');
    expect(p.get('session_id')).toBe('session-0');
  });

  it('applies the default language when the request omits one', async () => {
    const { transport, calls } = recordingTransport(okResponse({ localities: [] }));
    const client = makeClient({ transport, defaultLanguage: 'en' });

    await client.autocomplete({ input: 'baker street' });

    expect(paramsOf(calls[0]!).get('language')).toBe('en');
  });

  it('throws WoosmapRequestError when input is missing', async () => {
    const client = makeClient();
    await expect(client.autocomplete({ input: '' })).rejects.toBeInstanceOf(WoosmapRequestError);
  });

  it('surfaces API errors with status and body instead of swallowing them', async () => {
    const { transport } = recordingTransport(errResponse(403, { error: 'forbidden' }));
    const client = makeClient({ transport });

    await expect(client.autocomplete({ input: 'x' })).rejects.toMatchObject({
      name: 'WoosmapApiError',
      status: 403,
      body: { error: 'forbidden' },
    });
    await expect(client.autocomplete({ input: 'x' })).rejects.toBeInstanceOf(WoosmapApiError);
  });
});

describe('LocalitiesClient.getDetails', () => {
  it('sends public_id and the shared session_id', async () => {
    const { transport, calls } = recordingTransport(okResponse({ result: {} }));
    const client = makeClient({ transport });

    await client.getDetails({ publicId: 'pid-1', fields: ['geometry'], countryCodeFormat: 'alpha2' });

    const url = new URL(calls[0]!);
    const p = url.searchParams;
    expect(url.pathname).toBe('/localities/details');
    expect(p.get('public_id')).toBe('pid-1');
    expect(p.get('fields')).toBe('geometry');
    expect(p.get('cc_format')).toBe('alpha2');
    expect(p.get('session_id')).toBe('session-0');
  });

  it('throws WoosmapRequestError when publicId is missing', async () => {
    const client = makeClient();
    await expect(client.getDetails({ publicId: '' })).rejects.toBeInstanceOf(WoosmapRequestError);
  });
});

describe('LocalitiesClient session lifecycle (parity with LocalitiesService)', () => {
  it('shares one session across autocomplete calls and details, then resets after details', async () => {
    const { transport, calls } = recordingTransport(okResponse({}));
    const client = makeClient({ transport });

    await client.autocomplete({ input: '2' });
    await client.autocomplete({ input: '20' });
    await client.getDetails({ publicId: 'pid-1' });
    await client.autocomplete({ input: 'x' });

    expect(paramsOf(calls[0]!).get('session_id')).toBe('session-0');
    expect(paramsOf(calls[1]!).get('session_id')).toBe('session-0');
    expect(paramsOf(calls[2]!).get('session_id')).toBe('session-0');
    // A successful details ends the session → next autocomplete starts a new one.
    expect(paramsOf(calls[3]!).get('session_id')).toBe('session-1');
  });

  it('resetSession starts a new session (input cleared)', async () => {
    const { transport, calls } = recordingTransport(okResponse({}));
    const client = makeClient({ transport });

    await client.autocomplete({ input: 'a' });
    client.resetSession();
    await client.autocomplete({ input: 'a' });

    expect(paramsOf(calls[0]!).get('session_id')).toBe('session-0');
    expect(paramsOf(calls[1]!).get('session_id')).toBe('session-1');
  });
});

describe('LocalitiesClient.getDetails — SDK-parity post-processing', () => {
  it('wraps a raw geometry shape into a GeoJSON Feature (mirrors LocalitiesService)', async () => {
    const raw = { result: { geometry: { shape: { type: 'Polygon', coordinates: [] } } } };
    const { transport } = recordingTransport(okResponse(raw));
    const client = makeClient({ transport });

    const response = await client.getDetails({ publicId: 'pid-1' });

    expect(response.result.geometry?.shape).toMatchObject({
      type: 'Feature',
      geometry: { type: 'Polygon' },
      properties: {},
    });
  });

  it('leaves an already-wrapped Feature shape untouched', async () => {
    const raw = { result: { geometry: { shape: { type: 'Feature', geometry: { type: 'Point' }, properties: {} } } } };
    const { transport } = recordingTransport(okResponse(raw));
    const client = makeClient({ transport });

    const response = await client.getDetails({ publicId: 'pid-1' });

    expect(response.result.geometry?.shape).toMatchObject({ type: 'Feature', geometry: { type: 'Point' } });
  });
});

describe('LocalitiesClient with an app-proxy base URL', () => {
  it('omits the key and targets the proxy origin', async () => {
    const { transport, calls } = recordingTransport(okResponse({ localities: [] }));
    const client = new LocalitiesClient({
      baseUrl: 'https://shop.example/apps/woosmap/',
      transport,
      sessionIdFactory: () => 'sess',
    });

    await client.autocomplete({ input: 'a' });

    const url = new URL(calls[0]!);
    expect(url.searchParams.has('key')).toBe(false);
    expect(`${url.origin}${url.pathname}`).toBe('https://shop.example/apps/woosmap/localities/autocomplete/');
  });
});

describe('LocalitiesClient.geocode', () => {
  it('reverse-geocodes a point (latlng) and returns the results', async () => {
    const body = { results: [{ address_components: [{ types: ['locality'], long_name: 'Bordeaux' }] }] };
    const { transport, calls } = recordingTransport(okResponse(body));
    const client = new LocalitiesClient({ privateKey: 'secret', privateKeyIn: 'query', transport });

    const res = await client.geocode({ latLng: { lat: 44.83, lng: -0.57 } });

    const url = new URL(calls[0]!);
    expect(url.pathname).toBe('/localities/geocode');
    expect(url.searchParams.get('latlng')).toBe('44.83,-0.57');
    expect(url.searchParams.get('private_key')).toBe('secret'); // privateKeyIn: 'query' → direct server auth
    expect(res.results[0]!.address_components).toBeDefined();
  });

  it('throws when neither address nor latLng is given', async () => {
    const client = new LocalitiesClient({ transport: recordingTransport().transport });
    await expect(client.geocode({})).rejects.toBeInstanceOf(WoosmapRequestError);
  });

  it('throws WoosmapApiError on a non-2xx response', async () => {
    const client = new LocalitiesClient({ privateKey: 'k', privateKeyIn: 'query', transport: recordingTransport(errResponse(403, {})).transport });
    await expect(client.geocode({ latLng: { lat: 1, lng: 1 } })).rejects.toMatchObject({ name: 'WoosmapApiError', status: 403 });
  });
});

describe('LocalitiesClient.nearby', () => {
  it('builds location/types/radius and returns the results', async () => {
    const body = { pagination: {}, results: [{ name: 'Gare', categories: ['transit.station.rail.train'], geometry: { location: { lat: 1, lng: 2 } }, types: [] }] };
    const { transport, calls } = recordingTransport(okResponse(body));
    const client = new LocalitiesClient({ privateKey: 'secret', privateKeyIn: 'query', transport });

    const res = await client.nearby({ location: { lat: 48.8, lng: 2.3 }, types: 'transit.station', radius: 1000 });

    const url = new URL(calls[0]!);
    expect(url.pathname).toBe('/localities/nearby/');
    expect(url.searchParams.get('location')).toBe('48.8,2.3');
    expect(url.searchParams.get('types')).toBe('transit.station');
    expect(url.searchParams.get('radius')).toBe('1000');
    expect(url.searchParams.get('private_key')).toBe('secret');
    expect(res.results).toHaveLength(1);
  });

  it('throws when location or types is missing', async () => {
    const client = new LocalitiesClient({ transport: recordingTransport().transport });
    // @ts-expect-error location required
    await expect(client.nearby({ types: 'x' })).rejects.toBeInstanceOf(WoosmapRequestError);
    // @ts-expect-error types required
    await expect(client.nearby({ location: { lat: 1, lng: 1 } })).rejects.toBeInstanceOf(WoosmapRequestError);
  });
});
