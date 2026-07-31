// Shared plumbing for the two checkout-extension endpoints (autocomplete, details).
// Authenticates the session token, resolves the shop from the signed `dest` claim,
// loads the per-shop config, and constructs the Woosmap client.
import { LocalitiesClient } from "@woosmap/localities-client";
import { LocalitiesProxy } from "@woosmap/shopify-app-proxy";
import { authenticate } from "./shopify.server";
import { getWoosmapConfig, type WoosmapConfig } from "./woosmap-settings.server";

export interface CheckoutRequestContext {
  config: WoosmapConfig;
  params: Record<string, string>;
  /** Wraps a Response with the CORS headers the checkout sandbox requires. */
  cors: (response: Response) => Response;
}

/**
 * Authenticates a checkout-extension request and gathers everything the loaders need.
 * The shop is taken from the signed token, never from a client-supplied param.
 */
export async function authenticateWoosmapCheckout(request: Request): Promise<CheckoutRequestContext> {
  const { sessionToken, cors } = await authenticate.public.checkout(request);
  // `dest` may be a bare host (`shop.myshopify.com`) or a URL — normalise to host.
  const shop = String(sessionToken.dest).replace(/^https?:\/\//, "");
  const config = await getWoosmapConfig(shop);
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return { config, params, cors };
}

/** Builds a Woosmap Localities proxy bound to the shop's (decrypted) private key. */
export function createLocalitiesProxy(privateKey: string): LocalitiesProxy {
  return new LocalitiesProxy(new LocalitiesClient({ privateKey }));
}
