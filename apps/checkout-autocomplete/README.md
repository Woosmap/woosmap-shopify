# Woosmap Address Autocomplete: backend variant

A Shopify app that feeds **Woosmap Localities** predictions into the native checkout
address field while keeping the Woosmap **private key server-side**. Built on the
[Shopify App for React Router](https://shopify.dev/docs/api/shopify-app-react-router)
template; the Woosmap-specific parts are described below.

This is the **full-backend** variant. For the zero-infrastructure alternative (public
key, no server), see [`apps/checkout-autocomplete-lite`](../checkout-autocomplete-lite/README.md).
Both share [`@woosmap/localities-client`](../../packages/localities-client) via the pnpm
workspace (`workspace:*`), and this variant wraps it in
[`@woosmap/shopify-app-proxy`](../../packages/shopify-app-proxy) server-side.

## The extension

A **non-rendering** Checkout UI extension (`extensions/woosmap-address-autocomplete`)
hooks the native checkout address field through the
[`purchase.address-autocomplete.suggest`](https://shopify.dev/docs/apps/build/checkout/delivery-shipping/address-autocomplete/build-autocomplete)
and [`purchase.address-autocomplete.format-suggestion`](https://shopify.dev/docs/apps/build/checkout/delivery-shipping/address-autocomplete/format-suggestion)
targets ([target reference](https://shopify.dev/docs/api/checkout-ui-extensions/latest/targets/checkout/address)).
It adds **no visible block** and does not appear in the checkout editor. It feeds
Woosmap predictions straight into the native address dropdown. Requires Checkout
Extensibility (the new checkout).

### How it works

```
Checkout (buyer types address)
  └─ suggest target ──► GET /apps/woosmap/localities/autocomplete   (Authorization: Bearer <sessionToken>)
  └─ format target ──► GET /apps/woosmap/localities/details          (Authorization: Bearer <sessionToken>)
        └─ app backend: authenticate.public.checkout → Woosmap Localities API (private key, server-side)
```

- **Auth: session token, not the app proxy.** The extension calls the app backend
  **directly** (origin resolved in `src/backend.ts`) and authenticates each request with
  a Shopify session-token JWT, verified by `authenticate.public.checkout`. This avoids
  the storefront password gate that blocks the app proxy on development stores, and works
  on Plus checkouts hosted on other domains. (The `/apps/woosmap/…` path is the app-proxy
  subpath, reused only for routing.)
- **Country is inherited from Shopify Markets.** The extension always sends the buyer's
  `selectedCountryCode`, which Shopify constrains to the store's Markets. There is no
  configurable country allow-list.
- **The Woosmap private key never reaches the browser.** It is stored encrypted
  (AES-256-GCM) and used only server-side. Addresses are proxied to Woosmap and never
  persisted (see [GDPR / privacy](#gdpr--privacy)).

## Getting started

```shell
pnpm install                    # from the repo root, installs every workspace member

cd apps/checkout-autocomplete
cp .env.example .env            # then fill the variables below
pnpm setup                      # prisma generate + migrate: creates the SQLite session DB
pnpm dev                        # = shopify app dev; press P, then install on a dev store
```

`pnpm dev` links or creates a **separate** Shopify app on first run (its own
`shopify.app.toml`). Local development is powered by
[the Shopify CLI](https://shopify.dev/docs/apps/build/cli-for-apps): it logs in,
connects the app, injects env vars, and opens a tunnel.

### Required setup

**1. Environment variables** (`.env`)

| Variable | Purpose |
| --- | --- |
| `SETTINGS_ENC_KEY` | Base64-encoded 32-byte key used to encrypt the Woosmap key at rest. Generate with `openssl rand -base64 32`. |
| `SHOPIFY_APP_URL` | The app's public URL. Published to the `$app:app-url` metafield so the extension can find the backend in production (see step 3). |

The Woosmap **private key** itself is entered by the merchant on the app's **Settings**
page (`app/routes/app.settings.tsx`), stored encrypted and never displayed again.

**2. Grant Protected customer data access** (manual, per app/environment)

Because the targets read what the buyer types into the address field, Shopify treats it
as [protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data)
and blocks the extension at runtime until access is granted:

```
[purchase.address-autocomplete.suggest] ExtensionMissingRequiredAccessError:
Extension ... is missing required access to read customer personal data.
```

There is **no `shopify.app.toml` field** for this yet (tracked in
[Shopify/cli#3543](https://github.com/Shopify/cli/issues/3543)). Do it in the dashboard:

1. Open the app's **API access** page (Partner Dashboard → the app → *API access requests*;
   or the dev dashboard equivalent).
2. Under **Protected customer data access** → **Request access**.
3. Enable **Protected customer data** and the **Address** protected customer field
   (Level 2). Request nothing broader. Least privilege keeps prod review fast.
4. Save, then re-run `pnpm dev` (reinstall the app on the store if the grant doesn't take
   effect immediately).

On a **development store** this is granted immediately (no app review required). For
production the same request goes through Shopify's review.

**3. Production: the `$app:app-url` metafield**

In development the extension is served from the app's tunnel, so it derives the backend
origin from its own `scriptUrl`. In **production** the extension is served from
`extensions.shopifycdn.com`, so the app URL must be published to an app-owned metafield
instead. The app does this automatically in the `afterAuth` hook
(`app/publish-app-url.server.ts`), so a fresh install just works.

> **Existing production installs** created before this mechanism need one **re-auth** (or
> reinstall) to write the metafield the first time. Otherwise `appMetafields` is empty and
> there is no valid fallback in production.

### Verifying

Open the storefront → add a product to cart → go to checkout → type in the **Address**
field → Woosmap suggestions appear in the native dropdown. In the browser Network tab the
request to `.../apps/woosmap/localities/autocomplete` should return `200`.

## GDPR / privacy

The app reads protected customer data, so it implements the mandatory GDPR webhooks
(`app/routes/webhooks.customers.data_request.tsx`, `webhooks.customers.redact.tsx`,
`webhooks.shop.redact.tsx`). It stores **no** buyer address data. Addresses are proxied
to Woosmap and never persisted, so the redaction handlers have nothing to erase; only the
encrypted per-shop Woosmap key lives in the app DB.

## Project layout

```
apps/checkout-autocomplete/
├── app/
│   ├── woosmap-checkout.server.ts     # suggest/details → Woosmap Localities (private key)   ← tested
│   ├── woosmap-settings.server.ts     # per-shop key: AES-256-GCM encrypt / decrypt          ← tested
│   ├── publish-app-url.server.ts      # afterAuth: write $app:app-url metafield              ← tested
│   └── routes/
│       ├── app.settings.tsx           # embedded admin Settings page (merchant enters the key)
│       ├── apps.woosmap.localities.autocomplete.tsx   # suggest endpoint
│       ├── apps.woosmap.localities.details.tsx        # format-suggestion endpoint
│       └── webhooks.customers.*.tsx / webhooks.shop.redact.tsx  # GDPR
├── extensions/woosmap-address-autocomplete/
│   └── src/{suggest,format-suggestion,backend}.ts     # backend.ts origin resolution         ← tested
└── prisma/schema.prisma               # session storage (SQLite by default)
```

## Testing

```shell
pnpm --filter woosmap-address-autocomplete test        # vitest
pnpm --filter woosmap-address-autocomplete typecheck   # react-router typegen + tsc --noEmit
pnpm --filter woosmap-address-autocomplete coverage    # ≥80%
```

Covered: `woosmap-checkout.server` (suggest/details mapping + error paths),
`woosmap-settings.server` (encrypt/decrypt round-trip, key validation),
`publish-app-url.server` (metafield write), and the extension's `backend.ts` origin
resolution (dev tunnel vs. production metafield fallback). Run the whole monorepo with
`pnpm -r test` from the root.

## Deployment

Session data is stored with [Prisma](https://www.prisma.io/), SQLite by default
(`prisma/schema.prisma`), which is fine for a single production instance. For a
multi-instance deployment, switch the datasource to a hosted DB and/or a different
[session-storage adapter](https://github.com/Shopify/shopify-app-js/tree/main/packages/apps/session-storage).

Build and run:

```shell
pnpm --filter woosmap-address-autocomplete build
pnpm --filter woosmap-address-autocomplete start
```

Follow Shopify's [deployment guide](https://shopify.dev/docs/apps/launch/deployment) for
hosting, and set `NODE_ENV=production`. A `Dockerfile` is included (`docker-start` runs
`setup` then `start`).

## Publishing

The extension declares `network_access = true`, which Shopify must approve before the
version can be **published**, and the approval toggle has been missing from the new Dev
Dashboard (a known Shopify-side regression). See [`docs/publishing.md`](docs/publishing.md)
for the blocker details and how to unblock.

## Troubleshooting

### `ExtensionMissingRequiredAccessError` at `purchase.address-autocomplete.suggest`
The extension reads the buyer's address (protected customer data). Grant **Protected
customer data access** (including the **Address** field) in the dashboard, see
[Required setup, step 2](#required-setup). This is not configurable in `shopify.app.toml`.

### Checkout autocomplete returns no suggestions
- **`Cannot destructure property 'target'`**: the run target must read the API from the
  global `shopify` object; in `@shopify/ui-extensions` 2026.x the exported function takes
  **no argument**.
- **CORS / `500` on the backend call**: the loader crashed before the `cors()` wrapper ran
  (the CORS message is a red herring). Check the `shopify app dev` logs for the real stack.
- **Works in dev, not in production**: the `$app:app-url` metafield is missing;
  re-auth/reinstall so `afterAuth` writes it (see [Required setup](#required-setup), step 3).
- **Silent empty results**: the extension swallows all backend failures by design (never
  block checkout). Hit the endpoint directly or check server logs for the underlying error.

### `The table 'main.Session' does not exist`
The Prisma database hasn't been created. Run `pnpm setup` (`prisma generate && prisma
migrate deploy`).

> For generic template gotchas not specific to this app (upgrading from Remix, embedded-app
> navigation, webhook HMAC, Prisma on Windows/MongoDB), see the upstream
> [Shopify React Router template](https://github.com/Shopify/shopify-app-template-react-router).

## Resources

- [Shopify App for React Router](https://shopify.dev/docs/api/shopify-app-react-router)
- [Checkout UI extension address targets](https://shopify.dev/docs/api/checkout-ui-extensions/latest/targets/checkout/address)
- [Build customized address autocomplete](https://shopify.dev/docs/apps/build/checkout/delivery-shipping/address-autocomplete/build-autocomplete)
- [Work with protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data)
- [App proxies](https://shopify.dev/docs/apps/build/online-store/app-proxies)
- [Woosmap Localities API](https://developers.woosmap.com/products/localities/overview/)
