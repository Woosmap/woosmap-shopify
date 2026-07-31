# @woosmap/shopify-app-proxy

Server-side helpers for exposing [`@woosmap/localities-client`](../localities-client)
behind a **[Shopify App Proxy](https://shopify.dev/docs/apps/build/online-store/app-proxies)**, so the Woosmap **private** key never reaches the browser.

Used by `apps/checkout-autocomplete` (the full backend variant). The extension-only
variant (`apps/checkout-autocomplete-lite`) does **not** use this package. It calls
Woosmap directly with a public key.

## What it provides

- **`verifyAppProxySignature`** / **`computeAppProxySignature`**: validate that a request
  genuinely came through Shopify's App Proxy (HMAC-SHA256 over the query params, Web Crypto,
  works in Node and edge runtimes).
- **`LocalitiesProxy`**: a thin wrapper turning Woosmap Localities calls into the exact
  shapes Shopify's `purchase.address-autocomplete.{suggest,format-suggestion}` targets expect.
  Holds no secret; the key lives in the injected `LocalitiesClient`.

## Usage

```ts
import { LocalitiesClient } from "@woosmap/localities-client";
import { LocalitiesProxy, verifyAppProxySignature } from "@woosmap/shopify-app-proxy";

// In your app-proxy route:
if (!(await verifyAppProxySignature(params, process.env.SHOPIFY_API_SECRET))) {
  return new Response("Unauthorized", { status: 401 });
}

const proxy = new LocalitiesProxy(new LocalitiesClient({ privateKey: shopWoosmapKey }));
const { suggestions } = await proxy.suggest({ query, country, language });
const { formattedAddress } = await proxy.format({ id, language });
```
