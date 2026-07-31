# Publishing the checkout extension: known blocker

The `woosmap-address-autocomplete` checkout UI extension declares
`network_access = true` (`extensions/woosmap-address-autocomplete/shopify.extension.toml`),
required for the extension's `fetch()` to the app backend. This is what blocks
`shopify app deploy` from **publishing** the version until Shopify grants network access.

## The blocker

`shopify app deploy` creates the app version but **cannot publish** it:

> "Network access must be requested and approved for the woosmap-address-autocomplete
> extension to be published."

The approval toggle (**"Allow network access in checkout UI extensions"**) has been
**missing from the new dev.shopify.com Dashboard**: a known Shopify regression after the
Dev Dashboard migration (the classic Partner Dashboard redirects to the new one). So
publishing is blocked on **Shopify's side, not by our code**.

Ref: <https://community.shopify.dev/t/cant-enable-network-access-for-checkout-ui-extension-after-dev-dashboard-migration/36006>

_First hit during the prototype on a development store._

## How to unblock

1. Open a Shopify Partner support request for the app, asking to enable network access for
   the checkout UI extension, referencing the "Allow network access missing after Dev
   Dashboard migration" issue.
2. Once granted: `shopify app deploy --allow-updates`, then publish the version.
3. The custom autocomplete provider only runs at checkout on **Shopify Plus /
   checkout-extensibility** stores (dev stores can preview Plus). Confirm the target store
   has this before expecting the checkout to switch from the native provider to Woosmap.

## Notes

- Auth uses a **session token** verified by `authenticate.public.checkout` (not App Proxy
  HMAC), see the app [README](../README.md). The `network_access = true` requirement is
  independent of the auth mechanism: any `fetch()` from the extension needs it.
- Two different secrets: `SHOPIFY_API_SECRET` (the app's client secret) ≠ the merchant's
  Woosmap **private** key. Keep both out of the repo (env vars / secret manager only).

---

_Salvaged from the earlier `shopify-address-autocomplete` prototype (which predates this
monorepo). The prototype's `setup.md` / `app-integration.md` described the old App
Proxy + HMAC architecture and are obsolete. This app switched to session-token auth._
