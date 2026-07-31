// Endpoint hit directly by the checkout extension's `suggest` target.
// Authenticated with the extension's session-token JWT (NOT the app proxy), so
// it is not gated by the storefront password on dev stores.
import type { LoaderFunctionArgs } from "react-router";
import { authenticateWoosmapCheckout, createLocalitiesProxy } from "../woosmap-checkout.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { config, params, cors } = await authenticateWoosmapCheckout(request);
  if (!config.enabled || !config.key) {
    return cors(Response.json({ suggestions: [] }));
  }

  // The country is inherited from the checkout: it is always the buyer's
  // `selectedCountryCode`, which Shopify constrains to the store's Markets.
  const result = await createLocalitiesProxy(config.key).suggest({
    query: params.query ?? "",
    country: params.country,
    language: params.language ?? config.language ?? undefined,
  });

  return cors(Response.json(result));
}
