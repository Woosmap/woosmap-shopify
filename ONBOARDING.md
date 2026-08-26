# Onboarding: woosmap-shopify

A pnpm monorepo holding **shared Woosmap libraries** (`packages/*`) and **Shopify apps**
(`apps/*`). Packages are named by Woosmap API/capability, apps by surface
(checkout / storefront). Delivered so far: checkout address autocomplete (two variants)
plus a store locator and SEO store pages.

```
packages/                        # reusable libraries (one per Woosmap API)
├── localities-client/           # @woosmap/localities-client: worker-safe Localities client + mappers
├── distance-client/             # @woosmap/distance-client: worker-safe Distance Matrix client
├── store-search-client/         # @woosmap/store-search-client: Store Search client + Store model
├── local-page-engine/           # @woosmap/local-page-engine: platform-neutral LocalPage document + enrichment
└── shopify-app-proxy/           # @woosmap/shopify-app-proxy: server-side App Proxy HMAC + wrapper
apps/
├── checkout-autocomplete/       # full app: private key, server proxy, session-token auth, DB, OAuth
├── checkout-autocomplete-lite/  # extension-only: public key, direct Woosmap call, NO backend
├── store-locator/               # theme app extension: Woosmap Store Locator Widget, NO backend
└── store-pages/                 # one SEO page per store: `store` metaobject + Woosmap→metaobjectUpsert sync
```

Apps consume `packages/*` via `workspace:*`: one source of truth, no duplication, nothing
published to a registry.

## Prerequisites

- **Node** ≥ 20.19 (`<22 || >=22.12`), see `engines` in `package.json`.
- **pnpm** 10.x (`corepack enable` then `corepack prepare pnpm@latest --activate`).
- **Shopify CLI**: installed automatically as a devDependency; you log in on the first `shopify app dev`.
- **Shopify Partner account** + a **development store** (protected customer data and
  Checkout Extensibility are granted instantly there, no review).
- **Woosmap keys**: one **public** (referrer-restricted) for browser surfaces, one
  **private** for the server.

## Install

```shell
pnpm install        # at the root, installs every workspace member
```

## Tests (unit + types)

Root scripts, recursive across the whole workspace:

```shell
pnpm test           # = pnpm -r test        → ~165 tests (vitest)
pnpm typecheck      # = pnpm -r typecheck   → tsc / react-router typegen
pnpm coverage       # = pnpm -r coverage    → ≥80% gate (lines/branches/functions/statements)
```

Target a single member:

```shell
pnpm --filter @woosmap/store-search-client test
pnpm --filter woosmap-store-pages coverage
```

Test conventions: **vitest** everywhere, an injectable `fetch` transport so clients are
tested without the network, and an 80% coverage gate scoped to the business logic (not the
entrypoints that depend on the Shopify sandbox).

## Developing an app locally

Each app is a **separate Shopify app** (its own `shopify.app.toml`) → run the CLI **from its
directory**. They can all be installed on the **same** dev store.

```shell
cd apps/<app> && pnpm dev      # = shopify app dev; press P → install on the dev store
```

## Testing online (end-to-end)

There is no automated E2E harness: online verification is manual, per app.

| App | Key | Where you enter it | Final check |
|---|---|---|---|
| `checkout-autocomplete` | private | app **Settings** page | suggestions at checkout, `200` on `/apps/woosmap/localities/autocomplete` |
| `checkout-autocomplete-lite` | public | **checkout editor** | suggestions at checkout (direct Woosmap call) |
| `store-locator` | public | **theme editor** | widget + stores shown on the page |
| `store-pages` | private (sync) + public (theme) | sync env / theme setting | store SEO page + Static Maps image |

### `checkout-autocomplete` (backend)
```shell
cd apps/checkout-autocomplete
cp .env.example .env           # SETTINGS_ENC_KEY (openssl rand -base64 32) + SHOPIFY_APP_URL
pnpm setup                     # prisma generate + migrate (SQLite session DB)
pnpm dev
```
Then: grant **Protected customer data access** (the *Address* field, level 2) in the
dashboard → enter the **private key** on the Settings page → checkout → type an address.

### `checkout-autocomplete-lite` (no backend)
```shell
cd apps/checkout-autocomplete-lite && pnpm dev
```
Grant **Protected customer data access** → paste the **public key** in the checkout editor
→ test at checkout.

### `store-locator`
```shell
cd apps/store-locator && pnpm dev
```
Theme editor → **Add block → Apps → Woosmap Store Locator** → paste the **public key** →
view the storefront page.

### `store-pages` (with the sync job)
```shell
cd apps/store-pages
pnpm dev            # registers the `store` metaobject definition

# admin token: Admin → Settings → Apps → Develop apps → custom app
#   scopes: write_products, write_metaobjects, write_metaobject_definitions
SHOPIFY_SHOP=your-store.myshopify.com \
SHOPIFY_ADMIN_TOKEN=shpat_… \
WOOSMAP_PRIVATE_KEY=woos-private-… \
pnpm sync           # incremental: add SYNC_SINCE=2026-07-01T00:00:00
```
Then: copy `theme/templates/metaobject/store.liquid` into the theme → set
`woosmap_public_key` (theme setting) → open a store's public URL.

## Going further

Each app and package has its own `README.md` (details, trade-offs, gotchas):

- Apps: [`checkout-autocomplete`](apps/checkout-autocomplete/README.md) ·
  [`checkout-autocomplete-lite`](apps/checkout-autocomplete-lite/README.md) ·
  [`store-locator`](apps/store-locator/README.md) ·
  [`store-pages`](apps/store-pages/README.md)
- Packages: [`localities-client`](packages/localities-client/README.md) ·
  [`store-search-client`](packages/store-search-client/README.md) ·
  [`shopify-app-proxy`](packages/shopify-app-proxy/README.md)

Useful external docs: [Shopify: Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data) ·
[Shopify: Metaobjects](https://shopify.dev/docs/apps/build/metaobjects) ·
[Woosmap Localities](https://developers.woosmap.com/products/localities/overview/) ·
[Woosmap Stores](https://developers.woosmap.com/products/stores-api/overview/)
