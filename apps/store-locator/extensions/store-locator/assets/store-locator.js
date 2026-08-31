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
  var WEBAPP_SRC = "https://webapp.woosmap.com/webapp.js";
  var CONFIG_SELECTOR = "script.woosmap-store-locator__config";
  var MOBILE_QUERY = "(max-width: 600px)";

  /**
   * Parse the block's Configuration (JSON) field into a `setConf` object.
   * Returns `{ conf, error }`: `conf` is the object (or {} when blank/invalid, so the
   * map never blanks), `error` is a human-readable message when the input can't be
   * parsed into an object (surfaced only in the theme editor). Pure.
   */
  function parseConf(raw) {
    if (typeof raw !== "string" || raw.trim() === "") {
      return { conf: {}, error: null };
    }
    try {
      var value = JSON.parse(raw);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return { conf: value, error: null };
      }
      return { conf: {}, error: "Configuration must be a JSON object." };
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
    var script = doc.createElement("script");
    script.src = WEBAPP_SRC;
    script.async = true;
    script.onload = function () {
      var queue = win.__woosmapWebAppQueue || [];
      win.__woosmapWebAppQueue = [];
      for (var i = 0; i < queue.length; i += 1) {
        // One container's render must not abort the others': each has already been marked
        // rendered, so nothing would ever retry them.
        try {
          queue[i]();
        } catch (e) {
          if (win.console && typeof win.console.error === "function") {
            win.console.error(
              "[woosmap-store-locator] container failed to render",
              e,
            );
          }
        }
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
    var box = doc.createElement("div");
    box.className = "woosmap-store-locator__error";
    box.setAttribute("role", "alert");
    box.textContent =
      "Woosmap Store Locator — invalid Configuration (JSON): " +
      message +
      ". Using default configuration.";
    el.insertBefore(box, el.firstChild);
  }

  /**
   * Report locator interactions to the GA4 tag the theme loads, when the shop has
   * turned events on. The block installs no tag and sends no page view: page views and
   * consent stay with the theme, so these events land in the same property as the rest
   * of the site.
   *
   * The widget's event bus is shared by every instance on the page, so the events are
   * wired once per page, not once per container.
   */
  function trackLocator(webapp, win) {
    if (win.__woosmapLocatorTracked) {
      return;
    }
    // Subscribe whichever way the switch is set, and read it — and gtag, and consent — at
    // send time. Probing here instead meant a theme whose tag arrives from a consent
    // manager or a deferred loader lost the race against webapp.js and reported nothing
    // for the whole session, silently.
    win.__woosmapLocatorTracked = trackWebappEvents(webapp, win);
  }

  /**
   * Record what this block wants, for the page.
   *
   * The widget's event bus is a singleton and its events do not say which instance raised
   * them, so tracking cannot be per block however the setting is worded. A block that opts
   * out therefore silences the page: "Nothing is sent while this is off" is a promise worth
   * keeping literally, and one locator per page is the ordinary case anyway.
   *
   * Refreshed on every pass, so unticking the box in the theme editor takes effect on the
   * re-render rather than at the next full reload.
   */
  function applyTrackingChoice(win, wanted) {
    win.__woosmapLocatorTracking =
      win.__woosmapLocatorTracking !== false && !!wanted;
  }

  /**
   * Shopify's own consent state, when the theme exposes it. No API means the shop does not
   * use Shopify's banner and the theme's tag stays the authority, which is the documented
   * arrangement. Present and explicitly denied is the one case that must not send.
   */
  function analyticsAllowed(win) {
    var privacy = win.Shopify && win.Shopify.customerPrivacy;
    if (!privacy || typeof privacy.analyticsProcessingAllowed !== "function") {
      return true;
    }
    try {
      return privacy.analyticsProcessingAllowed() !== false;
    } catch (e) {
      return true;
    }
  }

  /**
   * Subscribe to the widget's events and send each one to GA4. The widget also hands
   * its callbacks the store's phone number and email, the visitor's route endpoints and
   * the address they searched; only the store id and the transport mode are read.
   *
   * FAVORITED is deliberately left out: the widget only shows its favorite button when
   * something listens to that event, so measuring it would change the storefront.
   * AUTOCOMPLETE and GEOCODE are left out too: their payload is what the visitor typed.
   */
  function trackWebappEvents(webapp, win) {
    var events = webapp.HANDLED_EVENT || {};
    var subscribed = 0;
    function send(name, storeId, params) {
      // All three read at send time: the switch can be re-ticked, a consent wrapper can
      // replace gtag after the widget mounts, and consent can be granted mid-session.
      if (!win.__woosmapLocatorTracking || typeof win.gtag !== "function") {
        return;
      }
      if (!analyticsAllowed(win)) {
        return;
      }
      params = params || {};
      params.interaction_source = "locator";
      if (typeof storeId === "string") {
        params.store_id = storeId;
      }
      win.gtag("event", name, params);
    }
    // webapp.js is loaded unpinned from the Woosmap CDN, and listenOn throws on a name it
    // does not declare: an event map or an event this version dropped is skipped, rather
    // than throwing out of the render callback and leaving the other blocks blank.
    function listen(key, handler) {
      // The name is checked because listenOn throws on one it does not declare; listenOn
      // ITSELF is checked for the same reason the name is — webapp.js is unpinned, and a
      // TypeError escaping here would abort the render queue and leave the other blocks on
      // the page blank, which is the outcome this guard exists to avoid.
      if (
        typeof events[key] === "string" &&
        typeof webapp.listenOn === "function"
      ) {
        webapp.listenOn(events[key], handler);
        subscribed += 1;
      }
    }
    function forward(key, name) {
      listen(key, function (storeId) {
        send(name, storeId);
      });
    }
    forward("SELECT_STORE", "store_selected");
    forward("PHONE_CLICK", "call_click");
    forward("EMAIL_CLICK", "email_click");
    // Fired once a route has been computed, and again on every recompute.
    forward("GET_DIRECTIONS", "directions_shown");
    forward("LOCATION_SELECTED", "search_location_selected");
    listen("SELECT_DIRECTION", function (storeId, route) {
      var mode = route && route.transportMode;
      send(
        "direction_selected",
        storeId,
        mode ? { transport_mode: mode } : null,
      );
    });
    // Only then is the page "tracked". Marking it so with nothing subscribed — an event map
    // this webapp.js build does not carry — locked in zero listeners for good.
    return subscribed > 0;
  }

  /**
   * [custom-filter-renderer] OPTIONAL — prettier filter panel with a service icon
   * per choice. Two renderers wired in initContainer (setFilterPanelRenderer +
   * setFilterRenderer), styled by the matching block in store-locator.css. To
   * disable: remove that block in initContainer + the CSS block. Icons are keyed by
   * the exact Woosmap tag value in FILTER_ICONS; unmatched tags get a neutral dot.
   */
  var FILTER_ICONS = {
    "Ice Store":
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12L2 12M17 3.34L7 20.66M7 3.34L17 20.66M18 12L19.86 8.5M18 12L19.86 15.5M15 6.8L12.9 3.45M15 6.8L18.96 6.95M9 6.8L5.04 6.95M9 6.8L11.1 3.45M6 12L4.14 15.5M6 12L4.14 8.5M9 17.2L11.1 20.55M9 17.2L5.04 17.05M15 17.2L18.96 17.05M15 17.2L12.9 20.55"/></svg>',
    "Pep Shop":
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 2A3.5 3.5 0 0 1 8.5 2L3 5l2.2 4L8 7.6V22h8V7.6L18.8 9 21 5z"/></svg>',
  };
  var FILTER_ICON_DEFAULT =
    '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>';
  // Green tick shown on the right of a selected choice (like the Woosmap example).
  var FILTER_CHECK_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';

  /** One choice row (icon + label + tick), mirroring the sample's structure/classes
   *  so the widget's `.filters-list` lays them out full-width. Re-called with the
   *  new `selected` on toggle. */
  function renderFilterChoice(key, label, selected) {
    var wrap = document.createElement("div");
    wrap.className = selected ? "wsl-filter active" : "wsl-filter";
    var icon = FILTER_ICONS[key] || FILTER_ICON_DEFAULT;
    wrap.innerHTML =
      '<button type="button">' +
      '<div class="icon-service" aria-hidden="true">' +
      icon +
      "</div>" +
      '<div class="flex-grow">' +
      label +
      "</div>" +
      '<div class="active-icon-wrapper" aria-hidden="true">' +
      FILTER_CHECK_ICON +
      "</div>" +
      "</button>";
    return wrap;
  }

  /** One filter group: wraps the choices in `<div class="filters-list">` (+ header).
   *  This is what creates the `.filters-list` container the CSS keys on — without it
   *  the widget's default wrapper leaves the choices 2-up and clipped. */
  function renderFilterPanel(title, children) {
    var text = title;
    if (text && typeof text === "object") {
      text = text.en || text[Object.keys(text)[0]] || "";
    }
    var panel = document.createElement("div");
    panel.className = "filters-list";
    var head = document.createElement("div");
    head.className = "filter-group";
    head.textContent = text || "";
    panel.appendChild(head);
    for (var i = 0; i < children.length; i += 1) {
      panel.appendChild(children[i]);
    }
    return panel;
  }

  /**
   * Render the widget into one container. No-ops when already rendered, when the
   * embedded config is missing/invalid, or when no public key is set (the block
   * shows a setup message in that case). In the theme editor, a bad Configuration
   * (JSON) surfaces a visible error; on the live storefront it stays silent and
   * falls back to the widget defaults.
   */
  function initContainer(el, win, doc) {
    if (!el) {
      return;
    }
    var config = readConfig(el);
    if (!config || !config.publicKey) {
      return;
    }
    // Before the rendered guard: the listeners outlive a re-render, so the switch has to be
    // read on every pass, not only on the one that mounted the widget.
    applyTrackingChoice(win, config.trackEvents);
    if (el.dataset.wslRendered) {
      return;
    }
    el.dataset.wslRendered = "true";
    var result = parseConf(config.advancedJson);
    if (result.error && win.Shopify && win.Shopify.designMode) {
      showConfigError(el, doc, result.error);
    }
    ensureWebApp(win, doc, function () {
      var isMobile =
        typeof win.matchMedia === "function" &&
        win.matchMedia(MOBILE_QUERY).matches;
      // The Woosmap WebApp API is NOT chainable: setConf/render are called on the
      // instance (per the official sample), so don't chain off setConf's return value.
      var webapp = new win.WebApp(el.id, config.publicKey);
      webapp.setConf(result.conf);
      // [custom-filter-renderer] Prettier filter panel with service icons.
      // Two renderers, as in the official sample: the PANEL renderer builds the
      // `.filters-list` wrapper (+ group header) our CSS keys on, the CHOICE
      // renderer draws each icon+label+tick row. Remove this block to fall back to
      // the widget's default filter rendering.
      if (typeof webapp.setFilterPanelRenderer === "function") {
        webapp.setFilterPanelRenderer(renderFilterPanel);
      }
      if (typeof webapp.setFilterRenderer === "function") {
        webapp.setFilterRenderer(renderFilterChoice);
      }
      webapp.render(isMobile);
      // Stop the map from hijacking page scroll: zoom only with Ctrl/⌘ held.
      setupCooperativeZoom(el, win, doc);
      trackLocator(webapp, win);
    });
  }

  /**
   * Cooperative gestures for the widget's GL map: a plain wheel over the map
   * lets the PAGE scroll (the map no longer zooms), and zooming requires
   * Ctrl/⌘ + wheel. A brief hint — "Use Ctrl + scroll to zoom" — flashes over
   * the map when the user scrolls without the modifier.
   *
   * The map mounts asynchronously after `render`, so we scan now and, if it's
   * not there yet, watch the container until it appears (then stop). The wheel
   * listener is added in the CAPTURE phase so it runs before the map's own
   * handler; `stopPropagation` (without `preventDefault`) blocks the zoom while
   * leaving the native page scroll intact.
   */
  function setupCooperativeZoom(el, win, doc) {
    var attached = false;

    function attach(mapEl) {
      if (attached || mapEl.__wslCoopZoom) {
        return;
      }
      attached = true;
      mapEl.__wslCoopZoom = true;

      var hint = doc.createElement("div");
      hint.className = "woosmap-store-locator__zoom-hint";
      hint.textContent = "Use Ctrl + scroll to zoom";
      hint.setAttribute("aria-hidden", "true");
      hint.style.cssText = [
        "position:absolute",
        "inset:0",
        "z-index:2",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "pointer-events:none",
        "opacity:0",
        "transition:opacity .2s ease",
        "font:600 15px/1.3 system-ui,-apple-system,sans-serif",
        "color:#fff",
        "text-align:center",
        "padding:1rem",
        "background:rgba(0,0,0,0.45)",
      ].join(";");

      if (
        win.getComputedStyle &&
        win.getComputedStyle(mapEl).position === "static"
      ) {
        mapEl.style.position = "relative";
      }
      mapEl.appendChild(hint);

      var hideTimer = null;
      function flashHint() {
        hint.style.opacity = "1";
        if (hideTimer) {
          win.clearTimeout(hideTimer);
        }
        hideTimer = win.setTimeout(function () {
          hint.style.opacity = "0";
        }, 1200);
      }

      mapEl.addEventListener(
        "wheel",
        function (e) {
          if (e.ctrlKey || e.metaKey) {
            return; // modifier held → let the map zoom as usual
          }
          e.stopPropagation(); // block the map's zoom; page keeps scrolling
          flashHint();
        },
        true,
      ); // capture phase: runs before the map's own wheel handler
    }

    function scan() {
      var mapEl = el.querySelector(".mapboxgl-map, .maplibregl-map");
      if (mapEl) {
        attach(mapEl);
        return true;
      }
      return false;
    }

    if (scan() || typeof win.MutationObserver !== "function") {
      return;
    }
    var obs = new win.MutationObserver(function () {
      if (scan()) {
        obs.disconnect();
      }
    });
    obs.observe(el, { childList: true, subtree: true });
    // Safety: stop watching once the map has had time to mount.
    win.setTimeout(function () {
      obs.disconnect();
    }, 15000);
  }

  /** Initialise every store-locator container currently in the document. */
  function initAll(win, doc) {
    var containers = doc.querySelectorAll("[data-woosmap-store-locator]");
    for (var i = 0; i < containers.length; i += 1) {
      initContainer(containers[i], win, doc);
    }
  }

  var api = {
    buildConf: buildConf,
    parseConf: parseConf,
    ensureWebApp: ensureWebApp,
    readConfig: readConfig,
    trackLocator: trackLocator,
    applyTrackingChoice: applyTrackingChoice,
    initContainer: initContainer,
    initAll: initAll,
    setupCooperativeZoom: setupCooperativeZoom,
    renderFilterChoice: renderFilterChoice,
    renderFilterPanel: renderFilterPanel,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else if (typeof window !== "undefined") {
    /* v8 ignore start -- browser bootstrap: exercised on the storefront, not under test */
    var boot = function () {
      initAll(window, window.document);
    };
    if (window.document.readyState === "loading") {
      window.document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
    // Theme editor: re-scan when a section is (re)rendered after a settings change,
    // so edits — including the Configuration (JSON) field — apply without a full reload.
    // The re-rendered container is a fresh node (no wslRendered flag), so it mounts anew.
    window.document.addEventListener("shopify:section:load", boot);
    /* v8 ignore stop */
  }
})();
