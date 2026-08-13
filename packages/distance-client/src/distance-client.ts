import { encodeLatLngList } from './params';
import { WoosmapApiError, WoosmapRequestError } from './errors';
import { defaultTransport, type Transport } from './transport';
import type {
  DistanceMatrixElement,
  DistanceMatrixRequest,
  DistanceMatrixResponse,
  LatLng,
  TravelMode,
} from './types';

const DEFAULT_BASE_URL = 'https://api.woosmap.com';
const MATRIX_PATH = '/distance/distancematrix/json';

/** Options for constructing a {@link DistanceClient}. */
export interface DistanceClientOptions {
  /** API base URL. Defaults to the public Woosmap API. */
  baseUrl?: string;
  /** Woosmap PUBLIC key — sent as `key` (client-side use). */
  key?: string;
  /** Woosmap PRIVATE key — sent as `private_key` (server-to-server). Never expose it client-side. */
  privateKey?: string;
  /** Fetch-like transport. Defaults to the global `fetch`. */
  transport?: Transport;
  /** Mode applied when a request omits its own. Defaults to `driving`. */
  defaultMode?: TravelMode;
}

/** Per-request options. */
export interface RequestOptions {
  signal?: AbortSignal;
}

/**
 * Worker-safe Woosmap Distance Matrix client over a pluggable `fetch`.
 * Sends `elements=duration_distance` by default so each cell carries both.
 */
export class DistanceClient {
  readonly #baseUrl: string;
  readonly #key: string | undefined;
  readonly #privateKey: string | undefined;
  readonly #transport: Transport;
  readonly #defaultMode: TravelMode;

  constructor(options: DistanceClientOptions = {}) {
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.#key = options.key;
    this.#privateKey = options.privateKey;
    this.#transport = options.transport ?? defaultTransport;
    this.#defaultMode = options.defaultMode ?? 'driving';
  }

  /** Full matrix: rows align with `origins`, each row's elements with `destinations`. */
  async distanceMatrix(request: DistanceMatrixRequest, options: RequestOptions = {}): Promise<DistanceMatrixResponse> {
    if (request.origins.length === 0 || request.destinations.length === 0) {
      throw new WoosmapRequestError('`origins` and `destinations` are both required for a distance matrix.');
    }

    const params = new URLSearchParams();
    params.set('origins', encodeLatLngList(request.origins));
    params.set('destinations', encodeLatLngList(request.destinations));
    params.set('mode', request.mode ?? this.#defaultMode);
    params.set('elements', request.elements ?? 'duration_distance');
    setIf(params, 'language', request.language);
    setIf(params, 'units', request.units);
    setIf(params, 'key', this.#key);
    setIf(params, 'private_key', this.#privateKey);

    const url = `${this.#baseUrl}${MATRIX_PATH}?${params.toString()}`;
    const response = await this.#transport(url, { signal: options.signal });
    if (!response.ok) {
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // Body may be empty or non-JSON; the status is what matters.
      }
      throw new WoosmapApiError('Woosmap Distance Matrix', response.status, response.statusText, body);
    }
    return (await response.json()) as DistanceMatrixResponse;
  }

  /**
   * One origin → N destinations for a single mode. Returns the elements aligned
   * with `destinations` (empty array when there are none — no call is made).
   */
  async travelTimes(
    origin: LatLng,
    destinations: LatLng[],
    mode?: TravelMode,
    options: RequestOptions = {},
  ): Promise<DistanceMatrixElement[]> {
    if (destinations.length === 0) return [];
    const res = await this.distanceMatrix({ origins: [origin], destinations, mode: mode ?? this.#defaultMode }, options);
    return res.rows[0]?.elements ?? [];
  }
}

function setIf(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined && value !== '') {
    params.set(key, value);
  }
}
