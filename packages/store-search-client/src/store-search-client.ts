import { encodeAutocompleteParams, encodeBoundsParams, encodeSearchParams } from './params';
import { WoosmapApiError, WoosmapRequestError } from './errors';
import { defaultTransport, type Transport } from './transport';
import type {
  StoreFeature,
  StoresAutocompleteRequest,
  StoresAutocompleteResponse,
  StoresBoundsRequest,
  StoresBoundsResponse,
  StoresSearchRequest,
  StoresSearchResponse,
} from './types';

const DEFAULT_BASE_URL = 'https://api.woosmap.com';
const SEARCH_PATH = '/stores/search';
const AUTOCOMPLETE_PATH = '/stores/autocomplete';
const BOUNDS_PATH = '/stores/search/bounds';
const STORE_PATH = '/stores';

/** Options for constructing a {@link StoreSearchClient}. */
export interface StoreSearchClientOptions {
  /** API base URL. Defaults to the public Woosmap API. */
  baseUrl?: string;
  /**
   * Woosmap PUBLIC key — sent as `key`. Referer-restricted, so a `Referer`
   * header must accompany it (see {@link StoreSearchClientOptions.referer}).
   * Fine in a browser; from a server prefer {@link privateKey}.
   */
  key?: string;
  /**
   * Woosmap PRIVATE key — sent as the `X-Api-Key` header. Authenticates
   * server-to-server (a public key 401/403s without a browser Referer), so this
   * is what the store-pages sync job uses. Never expose it client-side.
   */
  privateKey?: string;
  /**
   * `Referer` header value sent alongside a public {@link key}. Woosmap
   * validates the public key against the project's authorised referrers.
   */
  referer?: string;
  /** Fetch-like transport. Defaults to the global `fetch`. */
  transport?: Transport;
}

/** Per-request options. */
export interface RequestOptions {
  signal?: AbortSignal;
}

/**
 * Worker-safe Woosmap Store Search client.
 *
 * A faithful port of the maps-js `StoresService` contract — `search`,
 * `autocomplete`, `getStoreById`, `getBounds` — over a pluggable `fetch`, so it
 * runs server-side (the store-pages sync job) or in a worker without the browser
 * SDK. Adds {@link StoreSearchClient.iterateStores}, an async generator that
 * walks every page, which is what a full sync needs and the SDK does not provide.
 */
export class StoreSearchClient {
  readonly #baseUrl: string;
  readonly #key: string | undefined;
  readonly #privateKey: string | undefined;
  readonly #referer: string | undefined;
  readonly #transport: Transport;

  constructor(options: StoreSearchClientOptions = {}) {
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#key = options.key;
    this.#privateKey = options.privateKey;
    this.#referer = options.referer;
    this.#transport = options.transport ?? defaultTransport;
    if (!this.#key && !this.#privateKey) {
      throw new WoosmapRequestError('A Woosmap `key` or `privateKey` is required.');
    }
  }

  /** Search stores. Mirrors `StoresService.search`. */
  async search(
    request: StoresSearchRequest = {},
    options: RequestOptions = {},
  ): Promise<StoresSearchResponse> {
    const params = encodeSearchParams(request);
    return this.#get<StoresSearchResponse>(SEARCH_PATH, params, 'Woosmap Stores Search', options);
  }

  /** Autocomplete store names. Mirrors `StoresService.autocomplete`. */
  async autocomplete(
    request: StoresAutocompleteRequest,
    options: RequestOptions = {},
  ): Promise<StoresAutocompleteResponse> {
    const params = encodeAutocompleteParams(request);
    return this.#get<StoresAutocompleteResponse>(
      AUTOCOMPLETE_PATH,
      params,
      'Woosmap Stores Autocomplete',
      options,
    );
  }

  /** Retrieve one store by id. Mirrors `StoresService.getStoreById`. */
  async getStoreById(storeId: string, options: RequestOptions = {}): Promise<StoreFeature> {
    if (!storeId) {
      throw new WoosmapRequestError('`storeId` is required to fetch a store.');
    }
    return this.#get<StoreFeature>(
      `${STORE_PATH}/${encodeURIComponent(storeId)}`,
      new URLSearchParams(),
      'Woosmap Stores',
      options,
    );
  }

  /** Retrieve the bounding box of matching stores. Mirrors `StoresService.getBounds`. */
  async getBounds(
    request: StoresBoundsRequest,
    options: RequestOptions = {},
  ): Promise<StoresBoundsResponse> {
    const params = encodeBoundsParams(request);
    return this.#get<StoresBoundsResponse>(BOUNDS_PATH, params, 'Woosmap Stores Bounds', options);
  }

  /**
   * Yield every store matching `request`, page by page, following the response
   * `pagination.pageCount`. The `page` field on `request` is ignored — iteration
   * always starts at page 1. This is the entry point for a full or incremental
   * sync; pass `{ query: 'last_updated:>="…"' }` for incremental.
   */
  async *iterateStores(
    request: StoresSearchRequest = {},
    options: RequestOptions = {},
  ): AsyncGenerator<StoreFeature> {
    let page = 1;
    let pageCount = 1;
    do {
      const response = await this.search({ ...request, page }, options);
      for (const feature of response.features) {
        yield feature;
      }
      pageCount = response.pagination?.pageCount ?? page;
      page += 1;
    } while (page <= pageCount);
  }

  async #get<T>(
    path: string,
    params: URLSearchParams,
    context: string,
    options: RequestOptions,
  ): Promise<T> {
    const query = params.toString();
    const url = `${this.#baseUrl}${path}${query ? `?${query}` : ''}`;
    const response = await this.#transport(url, {
      signal: options.signal,
      headers: this.#authHeaders(),
    });

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

  #authHeaders(): Record<string, string> | undefined {
    const headers: Record<string, string> = {};
    if (this.#privateKey) {
      headers['X-Api-Key'] = this.#privateKey;
    }
    if (this.#referer) {
      headers['Referer'] = this.#referer;
    }
    return Object.keys(headers).length > 0 ? headers : undefined;
  }
}
