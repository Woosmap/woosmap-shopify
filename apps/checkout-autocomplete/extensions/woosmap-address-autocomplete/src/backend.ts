/**
 * Shared backend access for the checkout targets.
 *
 * The extension runs in a null-origin sandbox. Rather than routing through the
 * storefront app proxy (`{shop}/apps/woosmap`, gated by the online-store password
 * on dev stores), it calls the app backend directly and authenticates each request
 * with a Shopify session-token JWT (verified server-side by `authenticate.public.checkout`).
 */
const API_SUBPATH = 'apps/woosmap';

/** The slice of the checkout API this module needs — kept structural so both targets fit. */
export interface BackendApi {
  sessionToken: { get(): Promise<string> };
  extension: { scriptUrl: string };
  appMetafields: { metafield: { key: string; value: string } }[];
}

/**
 * Resolves the app backend origin.
 *
 * Production: the app publishes its URL to an app-owned metafield (`app_url`), read
 * here from `appMetafields`. Development fallback: the extension is served from the
 * app's tunnel, so its own `scriptUrl` origin already points at the backend.
 */
export function backendOrigin(api: BackendApi): string {
  const fromMetafield = api.appMetafields.find((m) => m.metafield.key === 'app-url')?.metafield.value;
  const origin = fromMetafield ?? new URL(api.extension.scriptUrl).origin;
  return origin.replace(/\/$/, '');
}

/**
 * Calls a backend endpoint with the session token and returns the parsed JSON, or
 * `null` on any failure. Failures are swallowed so autocomplete never blocks checkout.
 */
export async function callBackend<T>(
  api: BackendApi,
  path: string,
  params: Record<string, string | undefined>,
  signal?: AbortSignal,
): Promise<T | null> {
  try {
    const url = new URL(`${backendOrigin(api)}/${API_SUBPATH}/${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }
    const token = await api.sessionToken.get();
    const response = await fetch(url, { signal, headers: { Authorization: `Bearer ${token}` } });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}
