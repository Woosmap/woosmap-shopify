# Woosmap Store Locator (Theme App Extension)

A **backend-less** store locator: one Liquid **app block** that loads the Woosmap
**Store Locator Widget** ([WebApp.js](https://developers.woosmap.com/products/widgets/store-locator-widget/quick-start/))
into the storefront. The merchant adds it to any page in the theme editor and
configures it there.

```
extensions/store-locator/
├── shopify.extension.toml          # type = "theme"
├── blocks/store-locator.liquid     # app block (target: section) + {% schema %}: public key + Configuration (JSON)
├── assets/
│   ├── store-locator.js            # the loader (pure, unit-tested): schema `javascript` key
│   └── store-locator.css           # block styles: schema `stylesheet` key
└── locales/
    ├── en.default.json             # storefront string (the "missing key" message)
    └── en.default.schema.json      # editor/schema strings (setting labels)
test/store-locator.test.js          # vitest + jsdom tests for the loader
```

## How it works

- The block renders `<div data-woosmap-store-locator>` containing a
  `<script type="application/json">` with the merchant's **public key** and their raw
  **Configuration (JSON)** string.
- `assets/store-locator.js` (loaded once via the schema `javascript` key) scans for those
  containers, parses the config JSON into the `setConf` object, loads
  `https://webapp.woosmap.com/webapp.js` **once** per page, then renders the widget:
  ```js
  var webapp = new WebApp(id, publicKey); // NOT chainable: the official API
  webapp.setConf(conf);
  webapp.render(isMobile);
  ```
- It re-scans on `shopify:section:load`, so edits in the theme editor apply without a full
  page reload.
- The widget reads stores **directly and live from the Woosmap project**. There is **no
  Shopify data**, no metaobjects, and therefore **no dependency on `apps/store-pages`** and
  no sync.

Keeping the loader in a plain JS asset (instead of inlined in Liquid) makes its real logic
(the load-once queue, JSON parsing/fallback, mobile detection) **unit-testable**.

## No backend (on purpose)

| | This app |
| --- | --- |
| Web server / database | **none** |
| OAuth / sessions | **none** |
| Admin API scopes | **none** (`scopes = ""`) |
| Woosmap key | **public**, referrer-restricted, entered in the theme editor |
| Store data source | Woosmap project, **live**, in the browser |

The key is a **storefront** surface, so a **public** referrer-restricted key is the correct
choice (it's authorised for the merchant's domain: no Woosmap Plus, no private key,
nothing server-side).

## Setup

```shell
pnpm install                 # from the repo root (workspace)
cd apps/store-locator
shopify app dev              # links/creates a SEPARATE Shopify app on first run
```

Then in the theme editor: **Add block → Apps → Woosmap Store Locator**, paste the Woosmap
**public key**, and (optionally) a configuration JSON.

## Configuration (block settings)

The block exposes **three** fields:

| Setting | Purpose |
| --- | --- |
| **Woosmap public key** | Passed to `new WebApp(id, key)`. Referrer-restricted; **required**. Without it the block shows a setup message and does not render. |
| **Report interactions to Google Analytics** | Sends locator interactions as GA4 events through the theme's tag. Off by default. |
| **Configuration (JSON)** | The full Woosmap `setConf` object, pasted as JSON. Optional. |

The JSON **is** the widget configuration: the loader parses it and passes it straight to
`setConf`. This trades a per-option UI for the widget's full power (filters, directions,
custom markers, tiled styles) without fighting Shopify theme-setting constraints.

A starting point:

```json
{
  "datasource": { "maxResponses": 5, "maxDistance": 100000 },
  "maps": { "provider": "woosmap" },
  "theme": { "primaryColor": "#3578f6" },
  "internationalization": { "lang": "en" },
  "woosmapview": { "initialZoom": 12 }
}
```

See the [widget reference](https://developers.woosmap.com/products/widgets/store-locator-widget/store-locator-widget-reference/)
for the full option set. It's **strict JSON**. The Woosmap docs' JS-style examples must
be adapted (quote keys, drop trailing commas). Note the WebApp expects **camelCase** keys
(`maxResponses`, `maxDistance`, `primaryColor`), not snake_case.

**Feedback, not silence.** In the **theme editor**, a config that can't be parsed shows a
visible error banner in the block (with the parse message). On the **live storefront** it
stays silent and falls back to the widget's own defaults. It never blanks the page. An
empty field means an empty `setConf` (`{}`).

## Analytics (optional)

The locator can report what visitors do in it, as GA4 events sent through the tag the
**theme** already loads. It is off until the merchant ticks **Report interactions to Google
Analytics** in the block, right under the public key: the switch sits where the key sits,
which for a theme template means a theme setting or a shop metafield instead.

| GA4 event | Sent when |
| --- | --- |
| `search_location_selected` | an address or place suggestion is picked in the search field |
| `store_selected` | a store is opened, in the list or on the map |
| `directions_shown` | a route to a store has been computed, and on every recompute |
| `direction_selected` | an alternative route is picked from the route list; carries `transport_mode` |
| `call_click` | the store's phone number is clicked |
| `email_click` | the store's email address is clicked |

Every event carries `interaction_source: "locator"`, so a shop measuring several Woosmap
surfaces can split them, and `store_id` where the widget provides one.
`interaction_source`, `store_id` and `transport_mode` need matching **custom dimensions**
in GA4 to show up in reports.

**The theme owns the tag.** The block installs no tag, configures no property and sends no
page view: the locator page is measured like any other page of the site, by the shop's own
tag, and these events land in the same property as the rest of the traffic. Consent,
cookie banners and regional rules stay where the merchant already handles them. What that
implies:

- A `gtag` **defined in the theme** is required, typically a GA4 snippet in
  `theme.liquid`. A tag installed as a Shopify **web pixel** runs in a sandbox with no
  access to the storefront `window`, and a **GTM**-only `dataLayer` shim accepts these
  calls and drops them unless matching GTM tags exist. In both cases the events go
  nowhere, silently.
- The tag is read **when an event fires**, not when the widget mounts. A GA snippet
  installed by a consent manager or a deferred loader routinely loses the race against
  `webapp.js`, and probing at mount meant such a shop reported nothing for the whole
  session, silently. Interactions before the tag arrives are still lost; everything after
  it is not.
- Consent is read the same way. Where the theme exposes Shopify's Customer Privacy API,
  an explicit refusal stops these events; where it does not, the theme's own tag stays the
  authority, which only holds if that tag implements Consent Mode.
- The switch is **page-wide**, not per block. The widget's event bus is a singleton and its
  events do not say which instance raised them, so with two locators on one page, one of
  them opted out turns reporting off for both — the setting says "Nothing is sent while
  this is off", and that is the only reading which keeps the promise true.

**No personal data.** The widget also hands its callbacks the store's phone number and
email, the visitor's route endpoints, and the address they searched. None of it is read:
only the store id and the transport mode are.

**Favorites are not measured.** The widget shows its favorite button only when something
listens to that event, so measuring it would add a control to the storefront. Measurement
must not change the page.

## Verify

```shell
pnpm --filter woosmap-store-locator coverage   # vitest + jsdom, ≥80% on the loader
```

- **Loader logic** (`assets/store-locator.js`), unit-tested with vitest + jsdom: JSON
  parsing and safe fallback (blank / invalid / non-object), the editor-only error banner
  vs. silent storefront, the load-once queue, idempotent render, the mobile flag, the
  **non-chainable** `new WebApp(...)` → `setConf` → `render` sequence, and the GA4 wiring
  (off until the shop turns it on, off without a theme tag, no tag and no page view of its
  own, the event bus wired once per page, an event the widget dropped skipped, no phone,
  email or address in any payload).
- **Liquid / schema** (`blocks/store-locator.liquid`), `@shopify/theme-check` runs
  automatically on every `shopify app dev` bundle; a failing check blocks the dev preview.
- **End-to-end**, confirm on a dev store: add the block, paste a public key + config JSON,
  and check the widget renders your project's stores. The unit tests use a **fake** WebApp,
  so the live `webapp.js` contract is only exercised here. Do run this step.

## Future option (not built)

A **custom** locator rendered with Maps JS that reads stores through
[`@woosmap/store-search-client`](../../packages/store-search-client) instead of the widget,
useful if you need bespoke UI. Deliberately out of scope here.
