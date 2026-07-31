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

The block exposes just **two** fields:

| Setting | Purpose |
| --- | --- |
| **Woosmap public key** | Passed to `new WebApp(id, key)`. Referrer-restricted; **required**. Without it the block shows a setup message and does not render. |
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

## Verify

```shell
pnpm --filter woosmap-store-locator coverage   # vitest + jsdom, ≥80% on the loader
```

- **Loader logic** (`assets/store-locator.js`), unit-tested with vitest + jsdom: JSON
  parsing and safe fallback (blank / invalid / non-object), the editor-only error banner
  vs. silent storefront, the load-once queue, idempotent render, the mobile flag, and the
  **non-chainable** `new WebApp(...)` → `setConf` → `render` sequence.
- **Liquid / schema** (`blocks/store-locator.liquid`), `@shopify/theme-check` runs
  automatically on every `shopify app dev` bundle; a failing check blocks the dev preview.
- **End-to-end**, confirm on a dev store: add the block, paste a public key + config JSON,
  and check the widget renders your project's stores. The unit tests use a **fake** WebApp,
  so the live `webapp.js` contract is only exercised here. Do run this step.

## Future option (not built)

A **custom** locator rendered with Maps JS that reads stores through
[`@woosmap/store-search-client`](../../packages/store-search-client) instead of the widget,
useful if you need bespoke UI. Deliberately out of scope here.
