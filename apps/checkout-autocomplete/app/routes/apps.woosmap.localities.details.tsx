// Endpoint hit directly by the checkout extension's `format-suggestion` target.
// Authenticated with the extension's session-token JWT (NOT the app proxy).
import type { LoaderFunctionArgs } from "react-router";
import { authenticateWoosmapCheckout, createLocalitiesProxy } from "../woosmap-checkout.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { config, params, cors } = await authenticateWoosmapCheckout(request);
  if (!config.enabled || !config.key || !params.id) {
    return cors(Response.json({}));
  }

  const result = await createLocalitiesProxy(config.key).format({
    id: params.id,
    country: params.country,
    language: params.language ?? config.language ?? undefined,
  });

  return cors(Response.json(result));
}
