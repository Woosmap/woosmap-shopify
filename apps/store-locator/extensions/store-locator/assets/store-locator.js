/**
 * Woosmap Store Locator — storefront loader.
 *
 * Loaded once per page by the theme app extension (the block's schema
 * `javascript` key). It scans for `[data-woosmap-store-locator]` containers,
 * reads each one's config, loads webapp.js a single time, and renders the
 * Woosmap Store Locator Widget into each container.
 *
 * The merchant pastes the Woosmap `setConf` as the block's "Configuration (JSON)"
 * field (strict JSON). Invalid JSON never blanks the map — it falls back to the
 * widget defaults, and the parse error is surfaced only in the theme editor.
 *
 * Written as a classic browser script (no import/export) so Shopify can serve it
 * directly, but it also exposes its pure functions via `module.exports` when
 * required from a test (Node/vitest). The `typeof module` guard means the export
 * line never runs in the browser, and auto-init never runs under test.
 */
(function () {
  var WEBAPP_SRC = 'https://webapp.woosmap.com/webapp.js';
  var CONFIG_SELECTOR = 'script.woosmap-store-locator__config';
  var MOBILE_QUERY = '(max-width: 600px)';

  /**
   * Parse the block's Configuration (JSON) field into a `setConf` object.
   * Returns `{ conf, error }`: `conf` is the object (or {} when blank/invalid, so the
   * map never blanks), `error` is a human-readable message when the input can't be
   * parsed into an object (surfaced only in the theme editor). Pure.
   */
  function parseConf(raw) {
    if (typeof raw !== 'string' || raw.trim() === '') {
      return { conf: {}, error: null };
    }
    try {
      var value = JSON.parse(raw);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return { conf: value, error: null };
      }
      return { conf: {}, error: 'Configuration must be a JSON object.' };
    } catch (e) {
      return { conf: {}, error: e.message };
    }
  }

  /** The `setConf` object for a container's config (drops the error). Kept for callers/tests. */
  function buildConf(settings) {
    settings = settings || {};
    return parseConf(settings.advancedJson).conf;
  }

  /**
   * Ensure webapp.js is loaded exactly once per page, then run `cb`. Concurrent
   * callers queue and are flushed together on load; if it's already loaded, `cb`
   * runs synchronously.
   */
  function ensureWebApp(win, doc, cb) {
    if (win.WebApp) {
      cb();
      return;
    }
    win.__woosmapWebAppQueue = win.__woosmapWebAppQueue || [];
    win.__woosmapWebAppQueue.push(cb);
    if (win.__woosmapWebAppLoading) {
      return;
    }
    win.__woosmapWebAppLoading = true;
    var script = doc.createElement('script');
    script.src = WEBAPP_SRC;
    script.async = true;
    script.onload = function () {
      var queue = win.__woosmapWebAppQueue || [];
      win.__woosmapWebAppQueue = [];
      for (var i = 0; i < queue.length; i += 1) {
        queue[i]();
      }
    };
    doc.head.appendChild(script);
  }

  /** Read and parse the JSON config embedded in a container. Returns null on any problem. */
  function readConfig(el) {
    var node = el.querySelector(CONFIG_SELECTOR);
    if (!node) {
      return null;
    }
    try {
      return JSON.parse(node.textContent);
    } catch (error) {
      return null;
    }
  }

  /** Show a config error banner inside the container (theme editor only). */
  function showConfigError(el, doc, message) {
    var box = doc.createElement('div');
    box.className = 'woosmap-store-locator__error';
    box.setAttribute('role', 'alert');
    box.textContent = 'Woosmap Store Locator — invalid Configuration (JSON): ' + message + '. Using default configuration.';
    el.insertBefore(box, el.firstChild);
  }

  /**
   * Render the widget into one container. No-ops when already rendered, when the
   * embedded config is missing/invalid, or when no public key is set (the block
   * shows a setup message in that case). In the theme editor, a bad Configuration
   * (JSON) surfaces a visible error; on the live storefront it stays silent and
   * falls back to the widget defaults.
   */
  function initContainer(el, win, doc) {
    if (!el || el.dataset.wslRendered) {
      return;
    }
    var config = readConfig(el);
    if (!config || !config.publicKey) {
      return;
    }
    el.dataset.wslRendered = 'true';
    var result = parseConf(config.advancedJson);
    if (result.error && win.Shopify && win.Shopify.designMode) {
      showConfigError(el, doc, result.error);
    }
    ensureWebApp(win, doc, function () {
      var isMobile = typeof win.matchMedia === 'function' && win.matchMedia(MOBILE_QUERY).matches;
      // The Woosmap WebApp API is NOT chainable: setConf/render are called on the
      // instance (per the official sample), so don't chain off setConf's return value.
      var webapp = new win.WebApp(el.id, config.publicKey);
      webapp.setConf(result.conf);
      webapp.render(isMobile);
    });
  }

  /** Initialise every store-locator container currently in the document. */
  function initAll(win, doc) {
    var containers = doc.querySelectorAll('[data-woosmap-store-locator]');
    for (var i = 0; i < containers.length; i += 1) {
      initContainer(containers[i], win, doc);
    }
  }

  var api = {
    buildConf: buildConf,
    parseConf: parseConf,
    ensureWebApp: ensureWebApp,
    readConfig: readConfig,
    initContainer: initContainer,
    initAll: initAll
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof window !== 'undefined') {
    /* v8 ignore start -- browser bootstrap: exercised on the storefront, not under test */
    var boot = function () { initAll(window, window.document); };
    if (window.document.readyState === 'loading') {
      window.document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
    // Theme editor: re-scan when a section is (re)rendered after a settings change,
    // so edits — including the Configuration (JSON) field — apply without a full reload.
    // The re-rendered container is a fresh node (no wslRendered flag), so it mounts anew.
    window.document.addEventListener('shopify:section:load', boot);
    /* v8 ignore stop */
  }
})();
