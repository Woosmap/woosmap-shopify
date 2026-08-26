# @woosmap/local-page-engine

The **platform-neutral local store page model**. Store + enrichment + per-client config in,
a structured `LocalPage` document out. No HTML, no Liquid, no metaobject field keys, nothing
that assumes who renders the page.

```
store (Store Search)  ─┐
admin areas           ─┤
nearby POIs           ─┼─▶  buildLocalPage()  ─▶  LocalPage  ─▶  Shopify metaobjects
neighbouring stores   ─┤                                      ─▶  JSON feed
per-client config     ─┘                                      ─▶  server-rendered page
```

One document, several adapters. That is the whole point: a new platform is an adapter, a new
client is a config.

## Why it exists

The enrichment was already written and tested, but it lived inside `apps/store-pages` and its
output went straight into Shopify metaobject fields. Three consequences:

- the **SEO title, the JSON-LD and the static map were written in Liquid**, so they could not be
  reused by any other platform and could not be unit-tested;
- `STORE_FIELD_DEFINITIONS` — a Shopify metaobject schema — sat in the shared
  `@woosmap/store-search-client`, making the Shopify schema the de facto contract of the
  workspace;
- anything that is not Shopify had to re-derive the page content from scratch.

This package inverts that. The document is the contract; Shopify becomes one consumer of it.

## The contract

```ts
buildLocalPage(store, enrichment, config, { now }) => LocalPage
```

| Field | What it is |
| --- | --- |
| `slug`, `canonicalPath` | identity and location of the page |
| `canonicalUrl` | the absolute URL, when `config.origin` is set — `null` otherwise |
| `store` | the facts, straight from Store Search |
| `locale` | the BCP 47 tag the copy is written in, when `config.locale` is set |
| `admin`, `breadcrumb` | administrative hierarchy, trail with consecutive duplicates dropped |
| `nearby` | POIs by family, with travel time. `null` when not resolved |
| `nearbyStores` | neighbours, for internal linking. `null` when not resolved, `[]` when resolved empty |
| `seo` | title, description, canonical path, image alt |
| `jsonLd` | `LocalBusiness`, plus `BreadcrumbList` when a hierarchy resolved |
| `map` | Woosmap Static Maps illustration, with `alt` taken from `seo.imageAlt` |
| `directionsProvider` | which map a "directions" action should open, when configured |
| `computedAt` | when this document was built |

### `null` is not `[]`

For `nearby` and `nearbyStores`, the two say different things and an adapter that writes
incrementally needs both:

- **`null`** — the resolver did not run (a fresh TTL, the enricher switched off). *Leave whatever
  is stored alone.*
- **`[]`** — it ran and found nothing. *Replace the stored value*, because "this store has no
  neighbour any more" is a fact worth writing: omit it and a page keeps rendering links to
  neighbours it lost.

`buildLocalPage` preserves the distinction — an absent enrichment key becomes `null`, a present
one carries through, empty array included.

**Pure by design.** No fetch, no clock, no filesystem: the enrichment is resolved by the caller
and passed in, and `now` is injected. That is what makes the model testable without a network,
and what lets the same function run in a CLI today and inside the platform later without a
rewrite.

Enrichment is optional throughout — a store with no nearby data still yields a valid page, so
one failing enrichment call never costs you the page.

## Lifted from `store.liquid`, deliberately unchanged

The behaviour of the existing Shopify pages is preserved, so no published page changes:

- **`storeSlug`** is byte-for-byte `storeToMetaobjectHandle`. Same input, same output, so
  existing URLs and their accumulated SEO survive the move.
- **The static map** keeps the same endpoint, zoom 15 and 600×400 geometry, and the same
  `alt` copy. It stays an `<img>` with a **public** key: zero JavaScript, because crawlers and
  AI answer engines do not run JS, and cacheable, because that is what keeps the 20 req/s
  Static Maps quota viable. (Which is also why these requests cannot count page views —
  shared caches collapse many views into one origin request.)

  One caveat when the document leaves your own surface: a public key is referrer-restricted,
  and the restriction is checked against **whoever loads the image**, not whoever built the URL.
  Hand this document to a third party and either allow-list their domain or omit
  `config.publicKey` and let them build the URL from `store.lat`/`store.lng` with their own key.
- **`LocalBusiness`** omits `addressRegion`, `geo` and `telephone` rather than emitting them
  empty. Building it as an object also removes a class of bug Liquid invited here: a blank
  optional value left a dangling comma and silently invalidated the document.
- **`BreadcrumbList`** is emitted only when a region or a county resolved, and only the last
  rung carries an `item` URL — area pages do not exist yet, and declaring URLs that 404 is
  worse than declaring none. That `item` is absolute when it can be: `options.absoluteUrl`
  first (Liquid's `canonical_url`), then `config.origin`, then the bare path — schema.org wants
  an absolute URL, so a feed producer should configure the origin.

One place the lift was **not** faithful, and the template was the one that was wrong: the
breadcrumb dropped a duplicate `county`/`region` and `city`/`county`, but never compared
`region` with `country`, so Luxembourg rendered as `Luxembourg › Luxembourg`. `buildBreadcrumb`
drops any *consecutive* repeat. `store.liquid` was brought in line in the same change, and now
builds its trail once and reuses it for both the visible breadcrumb and the `BreadcrumbList` —
two renderings, one rule.

## New: the SEO copy

The one part that is **not** a lift. On Shopify the title and description came from the
metaobject's `renderable` capability pointing at merchant-editable fields, so nothing generated
them. A feed consumer has no such capability, so the model generates copy from templates:

```ts
{ title: '{name} — {city} | {brand}', description: '{name}, {address}, {zip} {city}. …' }
```

Placeholders: `{name}` `{brand}` `{address}` `{zip}` `{city}` `{county}` `{region}` `{country}`.
Missing values collapse and the punctuation is repaired, so one template serves a whole network
whichever fields a given store happens to be missing. Override per client via `config.seo`.

`seo.imageAlt` also feeds `map.alt` — it is the same string in two places a renderer looks, so
it is derived once. Overriding it moves both.

**The defaults are English**, and there is no per-language default set: a French network
overrides all three templates. `config.locale` labels the result on the document; it selects
nothing on its own, so set the two together.

## Use

```shell
pnpm --filter @woosmap/local-page-engine test
pnpm --filter @woosmap/local-page-engine coverage    # ≥80% gate
pnpm --filter @woosmap/local-page-engine example     # regenerate the reference document
```

[`examples/local-page.example.json`](./examples/local-page.example.json) is committed on
purpose: a document you can read is worth more in a review than the type, and it is what a
client's developer would be handed to decide whether they can consume the feed.
`test/example.test.ts` fails if it drifts from the model, because a stale reference document is
worse than none.

## Known state: three fields the Shopify adapter does not consume yet

`seo`, `jsonLd` and `map` are computed for every page, and on the Shopify surface they are
currently dropped — Shopify covers them another way (the `renderable` capability supplies the
title and description, and `store.liquid` builds its own JSON-LD and static-map `<img>`).

So the lift out of Liquid is done in TypeScript, but the Liquid original is still live: two
implementations of the same derivation, free to drift. That is not hypothetical — the breadcrumb
rule *had* already drifted before either copy shipped (see above). Feeding `store.liquid` from a
`json` metaobject field carrying `page.jsonLd` would remove the duplicate, delete ~45 lines of
string-concatenated Liquid, and put the document under unit test. It changes what the storefront
renders, so it belongs in its own change with a dev-store pass.

Until then the honest framing is: these three fields exist for the **next** adapter, and the
engine's claim to serve several platforms is not yet demonstrated by a second consumer. The feed
CLI is what would demonstrate it.

## The enrichment resolvers

`src/enrich/` holds the I/O half — the only part of the package that touches the network, always
over an **injected fetch** so every path is testable without one:

| Resolver | Calls | Notes |
| --- | --- | --- |
| `enrichNearby` | Localities Nearby + Distance Matrix | **one matrix request per travel mode**, not per POI — batching there is what keeps enrichment affordable |
| `reverseGeocode` | Localities Geocode | country-native values (Gironde, Kent), filled once |
| `findNearbyStores` | none | haversine over the in-memory store index |
| `isNearbyStale` | none | the TTL, i.e. the **second invalidation axis** |

That second axis is the one people forget. The store axis is event-driven — a store changes, you
rebuild its page. But the geography around a store changes *without the store changing*: a new
metro exit, a car park that closed. Nothing in the store record moves, so only a TTL sweep
catches it.

Both `fetchNearbyGroup` and `addDistances` swallow their errors by design: a store with no
nearby data still yields a valid page, so one failing call never costs you the page.

## Not in this package

**No rendering.** How a `LocalPage` becomes markup is the adapter's business.

**No Shopify.** The metaobject schema and mapper live in
`apps/store-pages/app/metaobject-mapping.server.ts`, downstream of this package: the sync builds
a `LocalPage`, then `localPageToMetaobjectFields(page)` maps it. A feed adapter, or a
server-rendered page, is a sibling of that file — not a fork of this engine.

**No measurement.** The page model records `config.directionsProvider` so a renderer knows
which map to open, but building the link — and attributing the click — belongs to the surface.
