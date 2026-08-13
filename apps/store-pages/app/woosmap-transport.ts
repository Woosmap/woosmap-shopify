/** A `fetch`-like function (injected in tests). */
export type FetchLike = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/** Adapt an injected fetch-like into the client libs' Transport shape. */
export function toTransport(fetchImpl: FetchLike) {
  return (url: string) => fetchImpl(url).then((r) => ({ ok: r.ok, status: r.ok ? 200 : 502, statusText: '', json: r.json }));
}
