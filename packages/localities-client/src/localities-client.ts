import { encodeComponents, encodeLatLng, encodeTypes } from './params';
import { WoosmapApiError, WoosmapRequestError } from './errors';
import { defaultTransport, type Transport } from './transport';
import { SessionManager, type SessionIdFactory } from './session';
import type {
  LocalitiesAutocompleteRequest,
  LocalitiesAutocompleteResponse,
  LocalitiesDetailsRequest,
  LocalitiesDetailsResponse,
  LocalitiesDetailsResult,
  LocalitiesGeocodeRequest,
  LocalitiesGeocodeResponse,
  LocalitiesNearbyRequest,
  LocalitiesNearbyResponse,
} from './types';

const DEFAULT_BASE_URL = 'https://api.woosmap.com';
const AUTOCOMPLETE_PATH = '/localities/autocomplete/';
const DETAILS_PATH = '/localities/details';
const GEOCODE_PATH = '/localities/geocode';
const NEARBY_PATH = '/localities/nearby/';

/** Options for constructing a {@link LocalitiesClient}. */
export interface LocalitiesClientOptions {
  /**
   * API base URL. Point this at your Shopify app-proxy (e.g.
   * `https://shop.example/apps/woosmap`) to keep the API key server-side.
   * Defaults to the public Woosmap API.
   */
  baseUrl?: string;
  /** Woosmap PUBLIC key — sent as the `key` query param (client-side use). */
  key?: string;
  /**
   * Woosmap PRIVATE key. By default sent as the `X-Api-Key` header (the app-proxy
   * backend). Public keys are referer-restricted and 401/403 from a server; a
   * private key authenticates server-to-server. Never expose it client-side.
   */
  privateKey?: string;
  /**
   * How to send `privateKey`: `header` (`X-Api-Key`, default — for the app-proxy)
   * or `query` (`private_key` — direct server-to-server calls to `api.woosmap.com`).
   */
  privateKeyIn?: 'header' | 'query';
  /** Fetch-like transport. Defaults to the global `fetch`. */
  transport?: Transport;
  /** Session id factory. Defaults to `crypto.randomUUID`. */
  sessionIdFactory?: SessionIdFactory;
  /** Language applied when a request omits its own. */
  defaultLanguage?: string;
}

/** Per-request options. */
export interface RequestOptions {
  signal?: AbortSignal;
}

/**
 * Worker-safe Woosmap Localities client.
 *
 * Faithful port of the Maps JS `LocalitiesService` contract — `autocomplete`
 * then `getDetails`, sharing one session id that resets after a successful
 * details — over a pluggable `fetch`, so it runs in the Shopify Checkout UI
 * Extension sandbox where the browser SDK cannot load.
 *
 * The `@types/woosmap.map` types describe the SDK's *post-processed* output, so
 * this client reproduces the SDK's response transforms (see
 * {@link transformShapeIfNeeded}) to stay contract-compatible. Any further
 * undocumented post-processing must be validated against a live response.
 */
export class LocalitiesClient {
  readonly #baseUrl: string;
  readonly #key: string | undefined;
  readonly #privateKey: string | undefined;
  readonly #privateKeyIn: 'header' | 'query';
  readonly #transport: Transport;
  readonly #defaultLanguage: string | undefined;
  readonly #session: SessionManager;

  constructor(options: LocalitiesClientOptions = {}) {
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#key = options.key;
    this.#privateKey = options.privateKey;
    this.#privateKeyIn = options.privateKeyIn ?? 'header';
    this.#transport = options.transport ?? defaultTransport;
    this.#defaultLanguage = options.defaultLanguage;
    this.#session = new SessionManager(options.sessionIdFactory);
  }

  /** The current session id, shared across autocomplete calls and the next details call. */
  get sessionId(): string {
    return this.#session.id;
  }

  /** Start a new session. Call when the address input is cleared. */
  resetSession(): void {
    this.#session.reset();
  }

  /** Retrieve autocomplete predictions for a partial address. */
  async autocomplete(
    request: LocalitiesAutocompleteRequest,
    options: RequestOptions = {},
  ): Promise<LocalitiesAutocompleteResponse> {
    if (!request.input) {
      throw new WoosmapRequestError('`input` is required to perform a Localities autocomplete.');
    }

    const params = this.#baseParams();
    params.set('input', request.input);
    setIf(params, 'components', encodeComponents(request.components));
    setIf(params, 'types', encodeTypes(request.types));
    setIf(params, 'excluded_types', encodeTypes(request.excluded_types));
    setIf(params, 'location', encodeLatLng(request.location));
    setIf(params, 'custom_description', request.customDescription);
    setIf(params, 'data', request.data);
    setIf(params, 'extended', request.extended);
    setIf(params, 'radius', request.radius !== undefined ? String(request.radius) : null);
    setIf(params, 'language', request.language ?? this.#defaultLanguage);
    params.set('no_deprecated_fields', 'true');
    params.set('session_id', this.#session.id);

    return this.#get<LocalitiesAutocompleteResponse>(
      AUTOCOMPLETE_PATH,
      params,
      'Woosmap Localities Autocomplete',
      options,
    );
  }

  /** Resolve full address details for a selected prediction, then end the session. */
  async getDetails(
    request: LocalitiesDetailsRequest,
    options: RequestOptions = {},
  ): Promise<LocalitiesDetailsResponse> {
    if (!request.publicId) {
      throw new WoosmapRequestError('`publicId` is required to perform a Localities details request.');
    }

    const params = this.#baseParams();
    params.set('public_id', request.publicId);
    setIf(params, 'language', request.language ?? this.#defaultLanguage);
    setIf(params, 'fields', encodeTypes(request.fields));
    setIf(params, 'cc_format', request.countryCodeFormat);
    params.set('session_id', this.#session.id);

    const response = await this.#get<LocalitiesDetailsResponse>(
      DETAILS_PATH,
      params,
      'Woosmap Localities Details',
      options,
    );

    // Mirror LocalitiesService: normalise the raw shape, then end the session.
    transformShapeIfNeeded(response.result);
    this.#session.reset();
    return response;
  }

  /** Reverse-geocode a point (`latLng`) or forward-geocode an `address`. */
  async geocode(request: LocalitiesGeocodeRequest, options: RequestOptions = {}): Promise<LocalitiesGeocodeResponse> {
    if (!request.address && !request.latLng) {
      throw new WoosmapRequestError('`address` or `latLng` is required to perform a Localities geocode.');
    }
    const params = this.#baseParams();
    setIf(params, 'address', request.address);
    setIf(params, 'latlng', encodeLatLng(request.latLng));
    setIf(params, 'components', encodeComponents(request.components));
    setIf(params, 'fields', encodeTypes(request.fields));
    setIf(params, 'excluded_types', encodeTypes(request.excluded_types));
    setIf(params, 'cc_format', request.countryCodeFormat);
    setIf(params, 'language', request.language ?? this.#defaultLanguage);
    return this.#get<LocalitiesGeocodeResponse>(GEOCODE_PATH, params, 'Woosmap Localities Geocode', options);
  }

  /** Nearby POIs around a point. */
  async nearby(request: LocalitiesNearbyRequest, options: RequestOptions = {}): Promise<LocalitiesNearbyResponse> {
    const location = encodeLatLng(request.location);
    if (!location) {
      throw new WoosmapRequestError('`location` is required to perform a Localities nearby request.');
    }
    const types = encodeTypes(request.types);
    if (!types) {
      throw new WoosmapRequestError('`types` is required to perform a Localities nearby request.');
    }
    const params = this.#baseParams();
    params.set('location', location);
    params.set('types', types);
    setIf(params, 'categories', encodeTypes(request.categories));
    setIf(params, 'excluded_types', encodeTypes(request.excluded_types));
    setIf(params, 'radius', request.radius !== undefined ? String(request.radius) : null);
    setIf(params, 'limit', request.limit !== undefined ? String(request.limit) : null);
    setIf(params, 'language', request.language ?? this.#defaultLanguage);
    return this.#get<LocalitiesNearbyResponse>(NEARBY_PATH, params, 'Woosmap Localities Nearby', options);
  }

  #baseParams(): URLSearchParams {
    const params = new URLSearchParams();
    if (this.#key) {
      params.set('key', this.#key);
    }
    if (this.#privateKey && this.#privateKeyIn === 'query') {
      params.set('private_key', this.#privateKey);
    }
    return params;
  }

  async #get<T>(
    path: string,
    params: URLSearchParams,
    context: string,
    options: RequestOptions,
  ): Promise<T> {
    const url = `${this.#baseUrl}${path}?${params.toString()}`;
    const headers =
      this.#privateKey && this.#privateKeyIn === 'header' ? { "X-Api-Key": this.#privateKey } : undefined;
    const response = await this.#transport(url, { signal: options.signal, headers });

    if (!response.ok) {
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // Body may be empty or non-JSON; the status is what matters.
      }
      throw new WoosmapApiError(context, response.status, response.statusText, body);
    }

    return (await response.json()) as T;
  }
}

/** Set a query parameter only when the value is meaningful (non-empty). */
function setIf(params: URLSearchParams, key: string, value: string | null | undefined): void {
  if (value !== null && value !== undefined && value !== '') {
    params.set(key, value);
  }
}

/**
 * Mirror `LocalitiesService`: the raw REST API returns `geometry.shape` as a
 * bare GeoJSON geometry, whereas the SDK (and thus the official types) wraps it
 * in a GeoJSON Feature. Reproduce that so the client's output matches the type.
 */
function transformShapeIfNeeded(result: LocalitiesDetailsResult | undefined): void {
  const geometry = result?.geometry as { shape?: { type?: string } } | undefined;
  if (geometry?.shape && geometry.shape.type !== 'Feature') {
    geometry.shape = {
      type: 'Feature',
      geometry: geometry.shape,
      properties: {},
    } as unknown as typeof geometry.shape;
  }
}
