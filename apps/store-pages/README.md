# Woosmap Store Pages

One **SEO page per store**, served natively by the Shopify Online Store. Each store is a
[`store` metaobject](https://shopify.dev/docs/apps/build/metaobjects) with the
**renderable** + **online_store**
[capabilities](https://shopify.dev/docs/apps/build/metaobjects/use-metaobject-capabilities);
a **sync job** pulls stores from Woosmap and upserts one metaobject per store. Shopify
renders the pages. The sync job is the **only backend**.

```
apps/store-pages/
├── shopify.app.toml                    # scopes + webhooks (the `store` metaobject is NOT declared here)
├── app/
│   ├── woosmap.server.ts               # StoreSearchClient from env (PRIVATE key)
│   ├── metaobject-mapping.server.ts    # LocalPage → `store` metaobject fields + the definition schema   ← tested
│   ├── admin-graphql.server.ts         # metaobjectUpsert + enable online_store (injectable executor)    ← tested
│   ├── store-sync.server.ts            # the sync: iterate Woosmap → build a LocalPage → upsert          ← tested
│   └── sync-runner.ts                  # runnable cron entry wiring the above
└── theme/templates/metaobject/
    └── store.liquid                    # SEO page + Woosmap Static Maps <img> + JSON-LD
```

## Data flow

```
Woosmap Store API ──(store-search-client)──▶ buildLocalPage()  ──▶ localPageToMetaobjectFields
                                                   ▲                          │
        Localities Nearby · Distance Matrix ───────┤                          ▼
        reverse-geocode · neighbours (haversine)   │                 metaobjectUpsert (store)
                        (local-page-engine/enrich) ┘                          │
                                            Shopify Online Store ◀───────────┘
                                                    (templates/metaobject/store.liquid)
```

This app is **one adapter** over [`@woosmap/local-page-engine`](../../packages/local-page-engine),
which owns the platform-neutral `LocalPage` document. The engine decides what a store page
*contains*; this app decides how it lands in Shopify. A feed, or a server-rendered page, would be
a sibling of `metaobject-mapping.server.ts` — not a fork of the engine.

The field keys written by the sync come from `localPageToMetaobjectFields`
(`app/metaobject-mapping.server.ts`) and **must** match `STORE_FIELD_DEFINITIONS` declared in the
same file. `metaobject-contract.test.ts` guards that coupling, which no compiler can catch.

## ⚠️ Ownership: the metaobject is merchant-owned, by design

The `store` metaobject is **merchant-owned** (type `store`, no `$app:` prefix) and is
**created automatically by the sync** on first run (`ensureStoreDefinition`, from
`STORE_FIELD_DEFINITIONS` in `app/metaobject-mapping.server.ts`). It is intentionally **not**
declared in `shopify.app.toml`.

Why not app-owned (`$app:store`): app-owned metaobjects are **namespaced to the owning
app**, so only store-pages' **own** token could read, update, or upsert them. A standalone
cron authenticates with a store-admin custom-app (or partner) token, which gets
`UNDEFINED_OBJECT_TYPE` on an app-owned type. That is **namespace isolation, not
permissions**: no scope fixes it, and `access.admin = merchant_read_write` only lets the
merchant edit entries in the Admin UI, not a third-party API token. store-pages also ships
no OAuth/session scaffolding, so it has no way to mint its own token for a cron.
Merchant-owned sidesteps all of this: any admin token with `write_metaobjects` (plus
`write_metaobject_definitions` to create the definition) manages everything.

Trade-off: the app no longer owns the schema, so the definition survives an app uninstall.
To go app-owned instead you would give store-pages real OAuth plus a resource route that
runs `syncStores` from `admin.graphql` with the app's own token (not built).

## First run (runbook, validated on a dev store)

```shell
pnpm install                       # from the repo root
```

**1. Install/deploy store-pages** so its config exists on the store:
```shell
pnpm --filter woosmap-store-pages deploy:shopify   # = shopify app deploy
```
`shopify app deploy` will ask to release a version. Accept. (The script is named
`deploy:shopify`, not `deploy`, because `pnpm deploy` is a pnpm built-in that would
silently do nothing here.)

**2. Get an Admin API token** (store-admin custom app):
Admin → Settings → Apps and sales channels → **Develop apps** → Create an app →
**Configure Admin API scopes**: `write_metaobjects`, `read_metaobjects`,
`write_metaobject_definitions`, `read_metaobject_definitions` → Install → copy the
`shpat_…` **Admin API access token**.

**3. Run the sync** against your Woosmap project (its **private** key). On first run it
**creates the merchant-owned `store` definition** (fields + `online_store` + `renderable`
SEO), then upserts one metaobject per store and **publishes** them (`ACTIVE`):
```shell
SHOPIFY_SHOP=your-store.myshopify.com \
SHOPIFY_ADMIN_TOKEN=shpat_… \
WOOSMAP_PRIVATE_KEY=woos-private-… \
pnpm --filter woosmap-store-pages sync
# incremental: add SYNC_SINCE=2026-07-01T00:00:00
# stage as drafts instead of publishing: add STORE_SYNC_DRAFT=true
# → "Sync done: N upserted (ACTIVE), 0 skipped, 0 failed (of N)."
```
It is idempotent, so re-running just re-syncs. Set `STORE_METAOBJECT_TYPE` only to point at
an existing definition of another type (the default is `store`).

The sync also builds a `LocalPage` per store (`@woosmap/local-page-engine`) and maps it. The
page config is optional — Shopify supplies most of it another way — but a consumer that reads
the document rather than the theme will want it:

| Variable | Effect |
| --- | --- |
| `STORE_URL_HANDLE` | path pages live under (`/pages/<handle>/…`, default `stores`). Drives the definition's URL handle, the page's canonical path **and** the neighbour links — one value, so they cannot drift |
| `STORE_BRAND` | `{brand}` in the generated SEO copy |
| `STORE_LOCALE` | BCP 47 tag recorded on the document. It labels the copy; it does not translate it (override the templates for that) |
| `STORE_PAGE_ORIGIN` | e.g. `https://shop.example.com` → absolute canonical and schema.org URLs. Liquid has `canonical_url`, so only an off-platform consumer needs this |
| `WOOSMAP_PUBLIC_KEY` | bakes the static-map URL into the document. The theme reads its own key, so the sync only needs this for a consumer that has no theme |

**4. Render the pages.** Copy `theme/templates/metaobject/store.liquid` into the theme
(Online Store → Themes → Edit code → Templates → new `metaobject/store` template), set the
Woosmap **public** key (theme setting `woosmap_public_key` or shop metafield
`woosmap.public_key`), then open `https://<shop>/pages/<urlHandle>/<handle>`. With the
default `urlHandle = stores`, that's `https://<shop>/pages/stores/<handle>`. (Metaobject
online-store pages live under `/pages/{urlHandle}/…`, not at the root, confirmed via
`/sitemap_metaobject_pages_1.xml`. The template file **must** be at
`templates/metaobject/store.liquid`. A generic `templates/store.liquid` is ignored.)

> Dev stores are password-protected by default. Disable it (Online Store → Preferences) or
> enter the password to view the page.

## Sync model

Shopify can neither pull nor cron on its own, so the **app drives the sync** with a shop
token. Default = **scheduled pull** (cron): idempotent, re-runnable, one metaobject per
store keyed by a stable handle derived from the Woosmap `store_id`.

- **Full sync:** iterate every store.
- **Incremental:** pass `since` → the job filters Woosmap with `last_updated:>="<ISO>"`,
  upserting only changed stores.
- **Webhook option:** a Woosmap inbound event can reuse the same `upsert` path for a single
  store. (Woosmap can't write Shopify directly; it pushes to the app.)

A single failing store never aborts the run. Its error is collected and the sync continues
(partial success), so one bad record can't block the rest. The Admin executor is
**throttle-aware** (`createFetchExecutor`): on an HTTP 429 or a `THROTTLED` GraphQL error it
waits and retries, pacing off `cost.throttleStatus`, so a bulk run over tens of thousands of
stores self-throttles instead of failing. (Upserts are still one-per-request; batching
aliased mutations / bulk operations is a further optimisation if needed.)

## Two capabilities are set via GraphQL, not TOML (by necessity)

Shopify's app config **cannot** fully declare two things:
- **`online_store`** (theme template + public URL): not TOML-configurable at all.
- **The `renderable` SEO field mapping** (`metaTitleKey`/`metaDescriptionKey`): TOML
  supports only the boolean `capabilities.renderable = true`; the field mapping is a
  GraphQL-only capability input.

So the sync sets both at **create** time, inside the `metaobjectDefinitionCreate` that
`ensureStoreDefinition` runs on the first sync. On later runs it reads the definition and
only updates the capabilities if they drifted (`ensureStorePageCapabilities`), idempotently.

## The store page template

[`theme/templates/metaobject/store.liquid`](https://shopify.dev/docs/storefronts/themes/architecture/templates/metaobject)
is delivered as a file to copy into the merchant's theme. It renders the store details, a
**Woosmap [Static Maps](https://developers.woosmap.com/products/map-static-api/get-started/) `<img>`**
(zero JS, WebP, cacheable, SEO-friendly), and `LocalBusiness` JSON-LD.

- Provide the Woosmap **public** key via a theme setting `woosmap_public_key` (or a
  `woosmap.public_key` shop metafield). **Never** put a private key in a theme.
- The browser sends the shop domain as `Referer`, satisfying the public key's referrer
  restriction (otherwise Static Maps returns **403**).
- `theme-check` flags the map `<img>` as a non-CDN asset. **Expected and intended**: the
  map is a Woosmap asset by design, not a theme asset.
- SEO title/description come from the renderable capability. `description` is merchant-owned
  and is **never overwritten by the sync**.
- The administrative breadcrumb is built **once** in the template and reused by the
  `BreadcrumbList` JSON-LD, dropping blanks and consecutive duplicates — the same rule as
  `buildBreadcrumb` in the engine. Keep the two in step until the JSON-LD is fed from
  `page.jsonLd` and the duplicate goes away.
- "Other stores nearby" is rewritten on every sync that runs the neighbour search, **including
  when a store no longer has any** — the sync writes `[]` so the section disappears. A store
  whose neighbours were not recomputed keeps the ones it had.

## Before syncing thousands of stores: verify

- **Metaobject entry limit.** Each definition holds up to **1,000,000 entries**
  (plan-independent), so tens of thousands fit comfortably. The constraint at scale is
  **write throughput**, not capacity (see the sync model's rate-limit note).
- **Static Maps quota.** Cap is **20 req/s per project**; the images are cached WebP served
  per page view, so normal traffic is fine. Bulk pre-warming is not.

## Verify (local)

```shell
pnpm --filter woosmap-store-pages typecheck
pnpm --filter woosmap-store-pages coverage   # ≥80% on the sync + Admin GraphQL modules
```

Unit tests cover `store-sync.server.ts` (full/incremental/partial-failure paths) and
`admin-graphql.server.ts` (upsert userErrors, idempotent capability enable, fetch executor).
The **sync pipeline** (Woosmap → metaobjects) is validated end-to-end on a dev store via the
runbook above; the Liquid template's live rendering is confirmed by copying it into a theme
and opening a store page (step 6).
