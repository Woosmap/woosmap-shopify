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
buildLocalPage(store, enrichment, config, { now }) => StoreLocalPage
```

| Field | What it is |
| --- | --- |
| `slug`, `canonicalPath` | identity and location of the page |
| `canonicalUrl` | the absolute URL, when `config.origin` is set — `null` otherwise |
| `subject` | **what the page is about.** Discriminate on `subject.kind` |
| `locale` | the BCP 47 tag the copy is written in, when `config.locale` is set |
| `admin`, `breadcrumb` | administrative hierarchy, trail with consecutive duplicates dropped |
| `seo` | title, description, canonical path, image alt |
| `jsonLd` | `LocalBusiness`, plus `BreadcrumbList` when a hierarchy resolved |
| `map` | Woosmap Static Maps illustration, with `alt` taken from `seo.imageAlt`. `null` on an area page, whose maps are per listed store |
| `directionsProvider` | which map a "directions" action should open, when configured |
| `computedAt` | when this document was built |

Everything above is true of any local page. What differs sits under `subject`, so an adapter
that only reads the SEO block, the breadcrumb or the structured data handles every kind of
page without knowing which one it holds.

`subject.kind === 'store'`:

| Field | What it is |
| --- | --- |
| `store` | the facts, straight from Store Search |
| `nearby` | POIs by family, with travel time. `null` when not resolved |
| `nearbyStores` | neighbours, for internal linking. `null` when not resolved, `[]` when resolved empty |

`buildLocalPage` returns `StoreLocalPage`, a `LocalPage` already narrowed to that subject, so
a store adapter needs no runtime check to reach `subject.store`.

`subject.kind === 'area'`:

| Field | What it is |
| --- | --- |
| `level`, `name`, `levelLabel` | which rung this is, its name, and what that rung is called here |
| `trail` | the hierarchy down to and including this area, each rung with its slug and page path |
| `intro` | one sentence generated from the area's own facts |
| `children` | the areas one level down that also got a page |
| `stores` | every store in the area, children included, each with its small map |

## Area pages

```ts
buildAreaPages(stores, adminByHandle, config, { now }) => AreaLocalPage[]
selectStaleAreas(existingSlugs, pages) => string[]
```

An area is an **aggregate**, which is why it cannot be one more `enrich` step: the store count
is only known once every store has been seen. The grouping is pure and in-memory, from data
already resolved (the store's own `city` plus the reverse-geocoded country, region and county),
so it costs no API call.

Every rung receives every store below it, so a region carries all its counties' stores as well
as its counties.

### The hierarchy does not travel

Localities normalises every country onto the same four rungs, but which rung deserves a page,
and what it is called, does not: a `county` is a Gironde in France and a Kreis in Germany. So
the rules resolve per country, `byCountry` winning over the defaults key by key:

```ts
buildAreaPages(stores, admin, {
  levels: ['region', 'county'],
  minStores: 2,
  byCountry: {
    FR: { levelLabels: { county: 'Département' }, intro: FRENCH_INTRO },
    NL: { levels: ['region'] },
  },
}, { now });
```

`country` is a level too, off by default. A network spanning several countries **should** enable
it: the country rung is what keeps slugs unique when two countries share a region name.

With it off, Limburg in Belgium and Limburg in the Netherlands fold into one page. Sharing the
page is deliberate — see `Draft.minStores`, which exists so a parent is never dropped under its
child — but that page then names **no country at all**: no `admin.country`, no country opening
the breadcrumb, none in the copy. Claiming whichever country arrived first would file half the
stores across a border. The build reports it through `onProblem` and carries on.

### Tell it what it had to work around

```ts
buildAreaPages(stores, admin, config, {
  now,
  onProblem: (problem) => console.warn(`[areas] ${problem.kind}: ${problem.name} — ${problem.detail}`),
});
```

Injected rather than logged, so the grouping stays pure: a CLI prints these, a scheduled sync
counts them. Each problem is reported once per name, never fatal, and says what was done:

| `kind` | What happened |
| --- | --- |
| `unaddressable-name` | No ASCII slug could be derived, so the rung and everything under it get no page. Latin diacritics are folded (`Łódzkie` → `lodzkie`, `Trøndelag` → `trondelag`); a non-Latin script is **not** transliterated, because `Αττική` → `attiki` rather than `attikí` is an editorial call the network makes at setup, not a default this package picks. |
| `cross-country-area` | One slug holds stores from several countries, so the page names none. Enable the `country` level. |
| `orphan-canonicalised` | A store with a county but no region forms its own root area rather than joining the fuller one — inventing the missing rung would file it under a region nobody resolved. The orphan keeps its stores and points its canonical at the fuller page, so the two do not compete for the same name in the index. |
| `ambiguous-orphan` | Two fuller areas share the orphan's name, so there is no single canonical target. Both stay indexable. |

### The trail is data, not just a slug

`subject.trail` carries the hierarchy rung by rung, so an adapter that can serve nested paths
builds `/france/nouvelle-aquitaine/gironde` from it while Shopify, which gives a metaobject page
one path segment, uses the flattened `slug`.

### Retirement deletes, it does not unpublish

`selectStaleAreas` returns the slugs an adapter should remove. An area page holds nothing the
grouping cannot regenerate, so deleting loses nothing, while a stale one left published shows a
store count that is no longer true.

It retires **nothing** when the grouping came back empty, which keeps a failed run from
deleting the whole network.

The structured data is a `BreadcrumbList` only. An `ItemList` of every member store would
dominate the document on a region holding hundreds; a renderer that shows a subset builds one
from `subject.stores`.

### `null` is not `[]`

For `subject.nearby` and `subject.nearbyStores`, the two say different things and an adapter that writes
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
- **`BreadcrumbList`** on a store page is emitted only when a region or a county resolved, and
  only the last rung carries an `item` URL: linking the admin rungs needs the store to know its
  area slug, which it does not yet. An area page links every rung, because every rung has a
  page. That `item` is absolute when it can be: `options.absoluteUrl` first (Liquid's
  `canonical_url`), then `config.origin`, then the bare path, because schema.org wants an
  absolute URL.

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
pnpm --filter @woosmap/local-page-engine example     # regenerate the reference documents
```

[`local-page.example.json`](./examples/local-page.example.json) and
[`area-page.example.json`](./examples/area-page.example.json) are committed on purpose: a
document you can read is worth more in a review than the type, and it is what a client's
developer would be handed to decide whether they can consume the feed.
`test/example.test.ts` fails if either drifts from the model, because a stale reference
document is worse than none.

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
