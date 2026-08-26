# @woosmap/store-search-client

Worker-safe client for the **Woosmap [Store Search API](https://developers.woosmap.com/products/stores-api/overview/)** (`/stores/search`,
`/stores/autocomplete`, `/stores/{id}`, `/stores/search/bounds`), plus a flat
`Store` domain model.

> **No Shopify in here.** The metaobject mapper used to live in this package, which
> made a Shopify schema the de facto contract of the whole workspace. It now sits in
> `apps/store-pages/app/metaobject-mapping.server.ts`, downstream of
> [`@woosmap/local-page-engine`](../local-page-engine), which owns the contract.

It is a faithful port of the maps-js **`StoresService`** contract, the same
axis as its sibling [`@woosmap/localities-client`](../localities-client) (which
ports `LocalitiesService`). One package per Woosmap API/capability.

- **Zero runtime dependencies**, transport (`fetch`) injectable → runs in Node,
  a Cloudflare Worker, or the edge.
- Errors are **surfaced, not swallowed** (unlike the SDK's `handleServiceError`),
  because the primary consumer is a sync job that must fail loudly and retry.

## Consumers

- **`@woosmap/local-page-engine`**: builds the platform-neutral page document from
  a `Store` (and computes the neighbour index).
- **`apps/store-pages`**: the sync job iterates every store, builds a `LocalPage`,
  and upserts one Shopify metaobject per store.
- **A future custom locator** (Maps JS): would read stores through this same client.

> The live **Store Locator Widget** (`apps/store-locator`) does **not** use this
> client: the widget reads stores directly from the Woosmap project in the browser.

## Usage

```ts
import { StoreSearchClient, featureToStore } from '@woosmap/store-search-client';
import { buildLocalPage, storeSlug } from '@woosmap/local-page-engine';

// Server-side: authenticate with the PRIVATE key (a public key needs a browser Referer).
const client = new StoreSearchClient({ privateKey: process.env.WOOSMAP_PRIVATE_KEY });

// Full sync, walk every page:
for await (const feature of client.iterateStores()) {
  const store = featureToStore(feature);
  const page = buildLocalPage(store, enrichment, config, { now });
  // → localPageToMetaobjectFields(page), then metaobjectUpsert({ type: 'store', handle: storeSlug(store.storeId) })
}

// Incremental sync, only stores changed since a timestamp:
client.iterateStores({ query: 'last_updated:>="2026-07-01T00:00:00"' });
```

### Authentication

| Option | Sent as | Use |
| --- | --- | --- |
| `privateKey` | `X-Api-Key` header | **server-to-server** (sync job) |
| `key` | `key` query param | browser; pair with `referer` (public keys are referrer-restricted) |

The constructor throws `WoosmapRequestError` if neither is provided.

## API surface

| Method | Endpoint | Notes |
| --- | --- | --- |
| `search(req)` | `/stores/search` | one page |
| `iterateStores(req)` | `/stores/search` | **async generator**, follows `pagination.pageCount` (SDK has no equivalent) |
| `autocomplete(req)` | `/stores/autocomplete` | |
| `getStoreById(id)` | `/stores/{id}` | |
| `getBounds(req)` | `/stores/search/bounds` | |

Requests use the SDK's camelCase shape (`latLng`, `storesByPage`); the client maps
them to the REST snake_case params (`lat`+`lng`, `stores_by_page`).

## Known contract note

The maps-js schema types the last-modified field as `lastUpdated`, but the live
REST API returns snake_case **`last_updated`**. This client tracks the live API.

## Develop

```shell
pnpm install          # from the repo root (workspace)
pnpm --filter @woosmap/store-search-client test
pnpm --filter @woosmap/store-search-client build
```

Tests use [vitest](https://vitest.dev) with a coverage gate of ≥80% on
branches/functions/lines/statements.
