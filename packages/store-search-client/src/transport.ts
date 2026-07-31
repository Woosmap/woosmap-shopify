/**
 * A minimal fetch-like transport. Injectable so Node's `fetch`, a Cloudflare
 * Worker `fetch`, or a test double can all be plugged in without the client
 * depending on any global directly. Kept self-contained (no dependency on a
 * sibling package) so this client stays independently publishable.
 */

/** The subset of a `fetch` Response the client needs. */
export interface TransportResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

/** Options passed through to the transport for a single request. */
export interface TransportInit {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/** A function that performs a GET-like request and resolves a {@link TransportResponse}. */
export type Transport = (url: string, init?: TransportInit) => Promise<TransportResponse>;

/**
 * Default transport backed by the ambient global `fetch`.
 * Resolved lazily so environments without `fetch` fail with a clear message
 * rather than at module load.
 */
export const defaultTransport: Transport = (url, init) => {
  const globalFetch = globalThis.fetch;
  if (typeof globalFetch !== 'function') {
    throw new Error('No global fetch available; provide a `transport` to StoreSearchClient.');
  }
  return globalFetch(url, init);
};
