# Woosmap Address Autocomplete: Lite (extension-only)

Backend-less variant of the checkout address autocomplete, living in the **same
monorepo** as the full-backend app (`apps/checkout-autocomplete`) and sharing `packages/localities-client` via the
pnpm workspace (`workspace:*`, no duplicated request lib, no `file:` links).

Run its Shopify CLI from **this** directory:

```shell
# from the repo root: install once (covers both apps via the workspace)
pnpm install

cd apps/checkout-autocomplete-lite
shopify app dev        # links/creates a SEPARATE Shopify app on first run
```

## How it differs from the backend variant (`apps/checkout-autocomplete`)

| | Backend variant (`apps/checkout-autocomplete`) | **Lite (this variant)** |
| --- | --- | --- |
| Woosmap key | **private**, stored encrypted server-side | **public**, referrer-restricted |
| Network call | extension → app backend → Woosmap | extension → **Woosmap directly** |
| Server to host | Node app + database (OAuth, sessions, proxy, Settings UI) | **none** |
| Merchant config | app Settings page (embedded admin) | **checkout editor** setting field |
| Key exposure | never leaves the server | **visible client-side** (see trade-off) |
| Shared request lib | `@woosmap/localities-client` (`workspace:*`) | same: **one source of truth** |

Both variants use the **same** `@woosmap/localities-client` (`LocalitiesClient`
+ `predictionToSuggestion` / `mapDetailsToFormattedAddress`). The backend variant wraps
it in `@woosmap/shopify-app-proxy` (server-side HMAC + wrapper); the lite
variant calls `core` and its mappers directly, since with no backend there is no
signature to verify and no private key to hide.

- `src/suggest.ts` → `LocalitiesClient.autocomplete()` → `predictionToSuggestion()`
- `src/format-suggestion.ts` → `LocalitiesClient.getDetails()` → `mapDetailsToFormattedAddress()`
- `src/woosmap.ts` builds the client from the merchant's checkout-editor settings.

## Setup notes

The merchant enters their **Woosmap public key** (and optional default language) in the
**checkout editor**, on the address autocomplete provider settings.

Still required regardless of backend:
**[Protected customer data access](https://shopify.dev/docs/apps/launch/protected-customer-data)**
(incl. the **Address** field, level 2) granted in the app's dashboard. Reading the buyer's
address is protected data. See `apps/checkout-autocomplete/README.md` for the exact steps.

## Trade-offs / open risks (verify on a dev store)

1. **Public key is exposed client-side.** The checkout sandbox origin is
   `extensions.shopifycdn.com` (shared by every Shopify checkout), so a referrer
   restriction can't be scoped to one merchant. A leaked key is usable from any
   Shopify checkout. Acceptable only if Woosmap quotas/abuse monitoring cover it.
2. **Settings surfacing.** Confirm the checkout editor actually exposes the
   `[extensions.settings]` fields for a **non-rendering** autocomplete provider. If it
   doesn't, deliver the key via an app metafield instead (reintroduces a small write path).
3. **App Store compliance.** A public app that reads protected customer data must
   subscribe to the mandatory GDPR webhooks, which need a receiving endpoint: a
   ~40-line stateless serverless stub (this app stores nothing). Omitted here on purpose.

## When to prefer which variant

- **Lite**: fastest to ship, zero infra, fine if a public key is acceptable and the
  target is a small number of Plus merchants (or a custom app).
- **Backend**: when the private key must never be exposed, or you want central control
  (per-shop config in your DB, quotas, analytics) and App Store distribution.
