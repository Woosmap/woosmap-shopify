# @woosmap/localities-client

Worker-safe client for the **Woosmap [Localities API](https://developers.woosmap.com/products/localities/overview/)** (address autocomplete + details),
plus mappers to the shapes Shopify's checkout address-autocomplete targets expect.

Runs anywhere `fetch` exists, including the **Shopify Checkout UI Extension sandbox**,
where the browser Woosmap SDK can't load. Used by both apps in this monorepo
(`apps/checkout-autocomplete` server-side, `apps/checkout-autocomplete-lite` client-side).

## Usage

```ts
import {
  LocalitiesClient,
  predictionToSuggestion,
  mapDetailsToFormattedAddress,
} from "@woosmap/localities-client";

// Public key (client-side, referrer-restricted) or privateKey (server-side).
const client = new LocalitiesClient({ key: "woos-public-key", defaultLanguage: "fr" });

// Autocomplete: cheap, no per-suggestion details call.
const { localities } = await client.autocomplete(
  { input: "5 av", types: ["address"], components: { country: "FR" } },
  { signal },
);
const suggestions = localities.map(predictionToSuggestion);

// Details: resolve one selected suggestion (one billed call), then map.
const { result } = await client.getDetails({ publicId: suggestions[0].id });
const address = mapDetailsToFormattedAddress(result);
```

## Options

| Option | Purpose |
| --- | --- |
| `key` | Woosmap **public** key (client-side, referrer-restricted). |
| `privateKey` | Woosmap **private** key (server-side; sent as `X-Api-Key`). Never expose client-side. |
| `baseUrl` | Override the API base (e.g. an app proxy). Defaults to the public Woosmap API. |
| `defaultLanguage` | Language applied when a request omits its own. |
| `transport` | Custom `fetch`-like transport (defaults to global `fetch`). |

## Exports

- `LocalitiesClient`: `autocomplete()`, `getDetails()`, session management.
- `predictionToSuggestion`, `mapDetailsToFormattedAddress`: Woosmap → Shopify shape mappers.
- `encodeComponents`, `encodeLatLng`, `encodeTypes`: param encoders.
- `WoosmapApiError`, `WoosmapRequestError`: typed errors.
