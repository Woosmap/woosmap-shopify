# woosmap-shopify

pnpm workspace holding shared Woosmap libraries and Shopify apps. Packages are named
by Woosmap API/capability; apps by storefront/checkout surface. Deliveries so far:
checkout address autocomplete (two variants) and a store locator + SEO store pages.

```
.
├── packages/                        # shared, reusable libraries (one per Woosmap API)
│   ├── localities-client/           # @woosmap/localities-client (worker-safe Localities client + mappers)
│   ├── distance-client/             # @woosmap/distance-client (worker-safe Distance Matrix client)
│   ├── store-search-client/         # @woosmap/store-search-client (Store Search client + Store model)
│   ├── local-page-engine/           # @woosmap/local-page-engine (platform-neutral LocalPage document + enrichment)
│   └── shopify-app-proxy/           # @woosmap/shopify-app-proxy (server-side HMAC + wrapper)
└── apps/
    ├── checkout-autocomplete/       # full app: private key, server-side proxy, session-token auth, DB, OAuth
    ├── checkout-autocomplete-lite/  # extension-only: public key, direct Woosmap call, NO backend
    ├── store-locator/               # theme app extension: Woosmap Store Locator Widget, NO backend, NO sync
    └── store-pages/                 # SEO page per store: `store` metaobject + Woosmap→metaobjectUpsert sync
```

Apps consume `packages/*` via `workspace:*`: one source of truth, no duplication,
no published package (yet).

## Getting started

```shell
pnpm install                      # installs every workspace member

cd apps/checkout-autocomplete && shopify app dev   # the full-backend variant
# or
cd apps/checkout-autocomplete-lite && shopify app dev      # the extension-only variant
```

Each app is a **separate Shopify app** (its own `shopify.app.toml`); run the CLI from
that app's directory. See each app's `README.md` for setup specifics (protected
customer data access, keys, trade-offs).

## Which variant?

- **`apps/checkout-autocomplete`**: private Woosmap key never leaves the server; central per-shop
  config, quotas, analytics; App Store-ready. Requires hosting (Node app + database).
- **`apps/checkout-autocomplete-lite`**: zero infrastructure; the merchant enters a **public** (referrer-restricted)
  key in the checkout editor and the extension calls Woosmap directly. Trade-off: the key
  is visible client-side. See `apps/checkout-autocomplete-lite/README.md`.

## Store locator vs store pages

Two independent apps, sharing only `@woosmap/store-search-client` (and even that only
`store-pages` uses today):

- **`apps/store-locator`**: a theme app extension that loads the Woosmap Store Locator
  Widget. Stores are read **live from the Woosmap project in the browser**; **no backend,
  no sync, no Shopify data**, so it does NOT depend on `store-pages`. Storefront surface →
  **public** key, set in the theme editor.
- **`apps/store-pages`**: one SEO page per store. An app-owned `store` **metaobject**
  (renderable + online_store) is fed by a **sync job** that pulls from Woosmap and
  `metaobjectUpsert`s one entry per store; Shopify renders the pages natively. The sync
  (server-side, **private** key) is the only backend. See its README for the
  `online_store`-not-in-TOML caveat and the metaobject entry / Static Maps quota checks.

## Publishing the shared library

`packages/*` are **not** published to a registry. They are shared in-repo via the pnpm
workspace. Publish them (private registry / npm) only once they need consumers outside
this repo; both apps would then depend on the versioned package instead of `workspace:*`.
