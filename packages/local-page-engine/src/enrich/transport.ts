/** A `fetch`-like function. Injected so the resolvers are testable without a network. */
export type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>;

/**
 * Adapt an injected fetch-like into the client libs' Transport shape.
 *
 * `json` is wrapped, not passed by reference: `json: r.json` detaches the method from its
 * Response and undici throws `Illegal invocation` when the client calls it.
 */
export function toTransport(fetchImpl: FetchLike) {
  return (url: string) =>
    fetchImpl(url).then((r) => ({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 502),
      statusText: '',
      json: () => r.json(),
    }));
}
