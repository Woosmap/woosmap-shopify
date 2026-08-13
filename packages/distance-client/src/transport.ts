/** A minimal fetch-like transport, injectable so any environment's `fetch`
 *  (Node, a worker sandbox, a test double) can be plugged in. */

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

/** Default transport backed by the ambient global `fetch`. */
export const defaultTransport: Transport = (url, init) => {
  const globalFetch = globalThis.fetch;
  if (typeof globalFetch !== 'function') {
    throw new Error('No global fetch available; provide a `transport` to DistanceClient.');
  }
  return globalFetch(url, init);
};
