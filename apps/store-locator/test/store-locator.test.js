import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildConf,
  parseConf,
  ensureWebApp,
  readConfig,
  trackLocator,
  applyTrackingChoice,
  initContainer,
  initAll,
  setupCooperativeZoom,
  renderFilterChoice,
  renderFilterPanel,
} from "../extensions/store-locator/assets/store-locator.js";

const SETTINGS = {
  publicKey: "woos-public",
  advancedJson:
    '{"datasource":{"maxResponses":7},"internationalization":{"lang":"fr"}}',
};

/** Build a container div with an embedded JSON config script (as the block emits). */
function container(config, id = "c1") {
  const el = document.createElement("div");
  el.id = id;
  el.setAttribute("data-woosmap-store-locator", "");
  if (config !== undefined) {
    const script = document.createElement("script");
    script.type = "application/json";
    script.className = "woosmap-store-locator__config";
    script.textContent =
      typeof config === "string" ? config : JSON.stringify(config);
    el.appendChild(script);
  }
  document.body.appendChild(el);
  return el;
}

/**
 * A fake WebApp mirroring the real (non-chainable) API: `setConf` and `render`
 * are both methods on the instance, and `setConf` returns nothing — so a loader
 * that chained `.setConf(conf).render()` would throw here, as it does in the browser.
 */
function fakeWebApp() {
  const setConf = vi.fn();
  const render = vi.fn();
  const ctor = vi.fn(function () {
    return { setConf, render };
  });
  return { ctor, setConf, render };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("parseConf", () => {
  it("parses strict JSON into { conf, error }", () => {
    expect(parseConf('{"a":1,"b":{"c":true}}')).toEqual({
      conf: { a: 1, b: { c: true } },
      error: null,
    });
  });

  it("returns {} and an error message on invalid JSON", () => {
    const result = parseConf("{ oops ");
    expect(result.conf).toEqual({});
    expect(result.error).toBeTruthy();
  });

  it("treats a non-object JSON value as empty, with an error", () => {
    expect(parseConf("[1,2]")).toEqual({
      conf: {},
      error: "Configuration must be a JSON object.",
    });
  });

  it("returns {} with no error when blank or absent", () => {
    expect(parseConf("   ")).toEqual({ conf: {}, error: null });
    expect(parseConf(undefined)).toEqual({ conf: {}, error: null });
  });
});

describe("buildConf", () => {
  it("returns just the parsed conf", () => {
    expect(buildConf(SETTINGS)).toEqual({
      datasource: { maxResponses: 7 },
      internationalization: { lang: "fr" },
    });
  });

  it("returns {} when the field is blank, absent, or invalid", () => {
    expect(buildConf({ publicKey: "x" })).toEqual({});
    expect(buildConf({ advancedJson: "{ bad" })).toEqual({});
    expect(buildConf()).toEqual({});
  });
});

describe("readConfig", () => {
  it("parses the embedded JSON config", () => {
    expect(readConfig(container(SETTINGS)).publicKey).toBe("woos-public");
  });

  it("returns null when the config script is missing", () => {
    const el = document.createElement("div");
    expect(readConfig(el)).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(readConfig(container("{ not json"))).toBeNull();
  });
});

describe("renderFilterChoice", () => {
  it("renders a labelled choice with a service icon (sample structure), not active by default", () => {
    const el = renderFilterChoice("Pep Shop", "Pep Shop", false);
    expect(el.classList.contains("wsl-filter")).toBe(true);
    expect(el.classList.contains("active")).toBe(false);
    expect(el.querySelector("button")).toBeTruthy();
    expect(el.querySelector(".flex-grow").textContent).toBe("Pep Shop");
    expect(el.querySelector(".icon-service svg")).toBeTruthy();
    expect(el.querySelector(".active-icon-wrapper svg")).toBeTruthy(); // tick present, hidden via CSS until active
  });

  it("marks the choice active when selected", () => {
    const el = renderFilterChoice("Ice Store", "Ice Store", true);
    expect(el.classList.contains("active")).toBe(true);
  });

  it("uses distinct icons per known tag and a neutral fallback for unknown ones", () => {
    const pep = renderFilterChoice("Pep Shop", "Pep Shop", false).querySelector(
      ".icon-service",
    ).innerHTML;
    const ice = renderFilterChoice(
      "Ice Store",
      "Ice Store",
      false,
    ).querySelector(".icon-service").innerHTML;
    const other = renderFilterChoice("Parking", "Parking", false).querySelector(
      ".icon-service",
    ).innerHTML;
    expect(pep).not.toBe(ice);
    expect(other).toContain("<circle"); // neutral dot fallback
    expect(pep).not.toContain("<circle");
  });
});

describe("renderFilterPanel", () => {
  it("wraps the group header + choices in a .filters-list container (as the sample does)", () => {
    const choices = [
      renderFilterChoice("Ice Store", "Ice Store", false),
      renderFilterChoice("Pep Shop", "Pep Shop", true),
    ];
    const panel = renderFilterPanel("Services", choices);
    expect(panel.classList.contains("filters-list")).toBe(true);
    expect(panel.querySelector(".filter-group").textContent).toBe("Services");
    expect(panel.querySelectorAll(".wsl-filter").length).toBe(2); // both choices appended
  });

  it("resolves a localized title object to its text", () => {
    const panel = renderFilterPanel({ en: "Amenities" }, []);
    expect(panel.querySelector(".filter-group").textContent).toBe("Amenities");
  });
});

describe("ensureWebApp", () => {
  it("runs the callback synchronously when WebApp is already present", () => {
    const win = { WebApp: function () {} };
    const cb = vi.fn();
    ensureWebApp(win, document, cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("injects the script once and flushes all queued callbacks on load", () => {
    const win = {};
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    ensureWebApp(win, document, cb1);
    ensureWebApp(win, document, cb2); // queued behind the same load

    const scripts = document.head.querySelectorAll("script");
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe("https://webapp.woosmap.com/webapp.js");
    expect(cb1).not.toHaveBeenCalled();

    scripts[0].onload();
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});

describe("initContainer", () => {
  it("constructs the widget with the public key and sets the parsed conf", () => {
    const app = fakeWebApp();
    const win = { WebApp: app.ctor, matchMedia: () => ({ matches: false }) };
    const el = container(SETTINGS);

    initContainer(el, win, document);

    expect(app.ctor).toHaveBeenCalledWith("c1", "woos-public");
    expect(app.setConf).toHaveBeenCalledWith(buildConf(SETTINGS));
    expect(app.render).toHaveBeenCalledWith(false);
    expect(el.dataset.wslRendered).toBe("true");
  });

  it("passes true to render on a mobile viewport", () => {
    const app = fakeWebApp();
    const win = { WebApp: app.ctor, matchMedia: () => ({ matches: true }) };
    initContainer(container(SETTINGS), win, document);
    expect(app.render).toHaveBeenCalledWith(true);
  });

  it("does nothing when the public key is missing (shows setup message instead)", () => {
    const app = fakeWebApp();
    const win = { WebApp: app.ctor, matchMedia: () => ({ matches: false }) };
    initContainer(container({ ...SETTINGS, publicKey: "" }), win, document);
    expect(app.ctor).not.toHaveBeenCalled();
  });

  it("surfaces a config error in the theme editor and still renders with defaults", () => {
    const app = fakeWebApp();
    const win = {
      WebApp: app.ctor,
      matchMedia: () => ({ matches: false }),
      Shopify: { designMode: true },
    };
    const el = container({
      publicKey: "woos-public",
      advancedJson: "{ broken",
    });

    initContainer(el, win, document);

    expect(el.querySelector(".woosmap-store-locator__error")).not.toBeNull();
    expect(app.setConf).toHaveBeenCalledWith({}); // falls back to empty conf
    expect(app.render).toHaveBeenCalled();
  });

  it("stays silent on the live storefront (no design mode) when the config is invalid", () => {
    const app = fakeWebApp();
    const win = { WebApp: app.ctor, matchMedia: () => ({ matches: false }) };
    const el = container({
      publicKey: "woos-public",
      advancedJson: "{ broken",
    });

    initContainer(el, win, document);

    expect(el.querySelector(".woosmap-store-locator__error")).toBeNull();
    expect(app.setConf).toHaveBeenCalledWith({});
  });

  it("is idempotent: a second call does not re-render", () => {
    const app = fakeWebApp();
    const win = { WebApp: app.ctor, matchMedia: () => ({ matches: false }) };
    const el = container(SETTINGS);
    initContainer(el, win, document);
    initContainer(el, win, document);
    expect(app.ctor).toHaveBeenCalledTimes(1);
  });

  it("ignores a missing element and invalid embedded config", () => {
    const app = fakeWebApp();
    const win = { WebApp: app.ctor, matchMedia: () => ({ matches: false }) };
    initContainer(null, win, document);
    initContainer(container("{bad"), win, document);
    expect(app.ctor).not.toHaveBeenCalled();
  });
});

describe("setupCooperativeZoom", () => {
  /** A container with (optionally) a GL map child, mirroring what the widget mounts. */
  function mapHost(withMap = true, mapClass = "mapboxgl-map", id = "m1") {
    const el = document.createElement("div");
    el.id = id;
    document.body.appendChild(el);
    if (withMap) {
      const map = document.createElement("div");
      map.className = mapClass;
      el.appendChild(map);
    }
    return el;
  }

  /** A `win` exposing just the globals the function needs (timers + observer + styles). */
  function zoomWin() {
    return {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      MutationObserver: globalThis.MutationObserver,
      getComputedStyle: (elm) => window.getComputedStyle(elm),
    };
  }

  /** A wheel event with a spy on stopPropagation/preventDefault. */
  function wheel(modifier) {
    const ev = new Event("wheel", { bubbles: true, cancelable: true });
    ev.ctrlKey = modifier === "ctrl";
    ev.metaKey = modifier === "meta";
    vi.spyOn(ev, "stopPropagation");
    vi.spyOn(ev, "preventDefault");
    return ev;
  }

  it("attaches to the map and injects the English hint", () => {
    const el = mapHost();
    setupCooperativeZoom(el, zoomWin(), document);
    const map = el.querySelector(".mapboxgl-map");

    expect(map.__wslCoopZoom).toBe(true);
    const hint = map.querySelector(".woosmap-store-locator__zoom-hint");
    expect(hint).not.toBeNull();
    expect(hint.textContent).toBe("Use Ctrl + scroll to zoom");
    expect(hint.style.opacity).toBe("0");
  });

  it("blocks the map zoom and flashes the hint on a plain wheel, without preventing page scroll", () => {
    const el = mapHost();
    setupCooperativeZoom(el, zoomWin(), document);
    const map = el.querySelector(".mapboxgl-map");
    const hint = map.querySelector(".woosmap-store-locator__zoom-hint");

    const ev = wheel(null);
    map.dispatchEvent(ev);

    expect(ev.stopPropagation).toHaveBeenCalled(); // map won't zoom
    expect(ev.preventDefault).not.toHaveBeenCalled(); // page keeps scrolling
    expect(hint.style.opacity).toBe("1"); // hint shown
  });

  it("lets the map zoom (no block, no hint) when Ctrl or ⌘ is held", () => {
    const el = mapHost();
    setupCooperativeZoom(el, zoomWin(), document);
    const map = el.querySelector(".mapboxgl-map");
    const hint = map.querySelector(".woosmap-store-locator__zoom-hint");

    const ctrl = wheel("ctrl");
    map.dispatchEvent(ctrl);
    const meta = wheel("meta");
    map.dispatchEvent(meta);

    expect(ctrl.stopPropagation).not.toHaveBeenCalled();
    expect(meta.stopPropagation).not.toHaveBeenCalled();
    expect(hint.style.opacity).toBe("0");
  });

  it("attaches once the map mounts asynchronously (MutationObserver)", async () => {
    const el = mapHost(false); // no map yet at render time
    setupCooperativeZoom(el, zoomWin(), document);

    const map = document.createElement("div");
    map.className = "maplibregl-map";
    el.appendChild(map);
    await new Promise((resolve) => setTimeout(resolve, 0)); // let the observer fire

    expect(map.__wslCoopZoom).toBe(true);
    expect(
      map.querySelector(".woosmap-store-locator__zoom-hint"),
    ).not.toBeNull();
  });

  it("does not attach twice to the same map", () => {
    const el = mapHost();
    const win = zoomWin();
    setupCooperativeZoom(el, win, document);
    setupCooperativeZoom(el, win, document);
    const map = el.querySelector(".mapboxgl-map");
    expect(
      map.querySelectorAll(".woosmap-store-locator__zoom-hint"),
    ).toHaveLength(1);
  });
});

describe("initAll", () => {
  it("initialises every container in the document", () => {
    const app = fakeWebApp();
    const win = { WebApp: app.ctor, matchMedia: () => ({ matches: false }) };
    container(SETTINGS, "a");
    container({ ...SETTINGS, publicKey: "woos-b" }, "b");

    initAll(win, document);

    expect(app.ctor).toHaveBeenCalledTimes(2);
    expect(app.ctor).toHaveBeenCalledWith("a", "woos-public");
    expect(app.ctor).toHaveBeenCalledWith("b", "woos-b");
  });
});

/** The widget's real event names, as `webapp.HANDLED_EVENT` exposes them. */
const EVENTS = {
  FAVORITED: "FavoritedEvent",
  SELECT_STORE: "SelectStoreEvent",
  UNSELECT_STORE: "UnselectStoreEvent",
  PHONE_CLICK: "PhoneClickEvent",
  EMAIL_CLICK: "EmailClickEvent",
  LOCATION_SELECTED: "LocationSelectedEvent",
  GEOCODE: "GeocodeEvent",
  AUTOCOMPLETE: "AutocompleteEvent",
  GET_DIRECTIONS: "GetDirectionsEvent",
  SELECT_DIRECTION: "SelectDirectionEvent",
};

/** Exactly the events the block is allowed to subscribe to. */
const SUBSCRIBED = [
  "EmailClickEvent",
  "GetDirectionsEvent",
  "LocationSelectedEvent",
  "PhoneClickEvent",
  "SelectDirectionEvent",
  "SelectStoreEvent",
];

/**
 * A WebApp exposing the event API. `listenOn` throws on a name outside HANDLED_EVENT,
 * as the widget's shared emitter does, and appends, so double wiring is visible.
 */
function trackedWebApp(handled = EVENTS) {
  const listeners = {};
  return {
    HANDLED_EVENT: handled,
    setConf: vi.fn(),
    render: vi.fn(),
    listenOn(event, callback) {
      if (Object.values(handled).indexOf(event) < 0) {
        throw new Error("UnknownEventError: " + event);
      }
      listeners[event] = listeners[event] || [];
      listeners[event].push(callback);
    },
    emit(event, ...args) {
      listeners[event].forEach((callback) => callback(...args));
    },
    listeners,
  };
}

/** Wire one WebApp to a fake gtag on a fresh page. */
function wired(handled) {
  const gtag = vi.fn();
  const webapp = trackedWebApp(handled);
  const win = { gtag };
  applyTrackingChoice(win, true);
  trackLocator(webapp, win);
  return { webapp, gtag, win };
}

describe("trackLocator", () => {
  it("sends nothing while the shop has not turned events on", () => {
    const gtag = vi.fn();
    const webapp = trackedWebApp();
    for (const wanted of [false, undefined]) {
      const win = { gtag };
      applyTrackingChoice(win, wanted);
      trackLocator(webapp, win);
      webapp.emit("SelectStoreEvent", "S1");
    }
    expect(gtag).not.toHaveBeenCalled();
    // Listeners DO exist: the switch and gtag are read when an event fires, not when it is
    // wired, so a tag that arrives late still gets its events and a switch flicked in the
    // theme editor takes effect without a reload. Nothing leaves the page meanwhile.
  });

  it("sends nothing, and does not throw, when the theme loads no gtag", () => {
    const webapp = trackedWebApp();
    const win = {};
    applyTrackingChoice(win, true);
    expect(() => trackLocator(webapp, win)).not.toThrow();
    expect(() => webapp.emit("SelectStoreEvent", "S1")).not.toThrow();
  });

  it("starts sending once the theme's tag shows up after the widget", () => {
    const webapp = trackedWebApp();
    const win = {};
    applyTrackingChoice(win, true);
    trackLocator(webapp, win);
    // A consent manager or a deferred loader installs gtag after webapp.js has won the race.
    const gtag = vi.fn();
    win.gtag = gtag;
    webapp.emit("SelectStoreEvent", "S1");
    expect(gtag).toHaveBeenCalledWith("event", "store_selected", {
      interaction_source: "locator",
      store_id: "S1",
    });
  });

  it("stops sending the moment the switch is turned off", () => {
    const { webapp, gtag, win } = wired();
    webapp.emit("SelectStoreEvent", "S1");
    applyTrackingChoice(win, false);
    webapp.emit("SelectStoreEvent", "S2");
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when Shopify says the visitor refused analytics", () => {
    const { webapp, gtag, win } = wired();
    win.Shopify = {
      customerPrivacy: { analyticsProcessingAllowed: () => false },
    };
    webapp.emit("SelectStoreEvent", "S1");
    expect(gtag).not.toHaveBeenCalled();
  });

  it("sends when Shopify says analytics are allowed, and when it says nothing at all", () => {
    const allowed = wired();
    allowed.win.Shopify = {
      customerPrivacy: { analyticsProcessingAllowed: () => true },
    };
    allowed.webapp.emit("SelectStoreEvent", "S1");
    expect(allowed.gtag).toHaveBeenCalledTimes(1);

    const silent = wired();
    silent.win.Shopify = {};
    silent.webapp.emit("SelectStoreEvent", "S1");
    expect(silent.gtag).toHaveBeenCalledTimes(1);
  });

  it("keeps sending when the consent API itself throws", () => {
    const { webapp, gtag, win } = wired();
    win.Shopify = {
      customerPrivacy: {
        analyticsProcessingAllowed: () => {
          throw new Error("not ready");
        },
      },
    };
    webapp.emit("SelectStoreEvent", "S1");
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it("does not mark the page tracked when the widget declares no events", () => {
    const win = { gtag: vi.fn() };
    applyTrackingChoice(win, true);
    trackLocator({}, win);
    // Marking it locked in zero listeners for good, with no diagnostic.
    expect(win.__woosmapLocatorTracked).toBeFalsy();
  });

  it("does not throw when the widget dropped listenOn entirely", () => {
    const win = { gtag: vi.fn() };
    applyTrackingChoice(win, true);
    // webapp.js is unpinned; a TypeError here used to abort the whole render queue.
    expect(() =>
      trackLocator(
        { HANDLED_EVENT: { SELECT_STORE: "SelectStoreEvent" } },
        win,
      ),
    ).not.toThrow();
  });

  it("lets one opted-out block silence the page, as the setting promises", () => {
    const webapp = trackedWebApp();
    const gtag = vi.fn();
    const win = { gtag };
    // The bus is shared and its events do not say which block raised them.
    applyTrackingChoice(win, true);
    applyTrackingChoice(win, false);
    trackLocator(webapp, win);
    webapp.emit("SelectStoreEvent", "S1");
    expect(gtag).not.toHaveBeenCalled();
  });

  it("registers no tag and no page view of its own", () => {
    const { gtag, webapp } = wired();
    expect(gtag).not.toHaveBeenCalled();
    webapp.emit(EVENTS.SELECT_STORE, "1264");
    webapp.emit(EVENTS.LOCATION_SELECTED, { labelAddress: "anywhere" });
    expect(gtag.mock.calls.map(([kind]) => kind)).toEqual(["event", "event"]);
    expect(gtag.mock.calls.map(([, name]) => name)).not.toContain("page_view");
  });

  it("gives up rather than throw when the widget carries no event map", () => {
    const gtag = vi.fn();
    const win = { gtag };
    applyTrackingChoice(win, true);
    expect(() => trackLocator({}, win)).not.toThrow();
    expect(gtag).not.toHaveBeenCalled();
  });

  it("sends through the gtag in place at send time, not the one captured at mount", () => {
    const { webapp, win } = wired();
    const replacement = vi.fn();
    win.gtag = replacement;
    webapp.emit(EVENTS.SELECT_STORE, "1264");
    expect(replacement).toHaveBeenCalledTimes(1);
  });

  /** An exact set, so a new subscription has to be declared here to pass. */
  it("subscribes to those six events and to nothing else", () => {
    const { webapp } = wired();
    expect(Object.keys(webapp.listeners).sort()).toEqual(SUBSCRIBED);
  });

  it("wires the shared event bus once per page", () => {
    const gtag = vi.fn();
    const win = { gtag };
    const first = trackedWebApp();
    const second = trackedWebApp();
    applyTrackingChoice(win, true);
    trackLocator(first, win);
    trackLocator(first, win);
    trackLocator(second, win);
    Object.values(first.listeners).forEach((registered) =>
      expect(registered).toHaveLength(1),
    );
    expect(Object.keys(second.listeners)).toHaveLength(0);
  });

  it("skips an event this widget version no longer declares, and keeps the others", () => {
    const partial = { ...EVENTS };
    delete partial.EMAIL_CLICK;
    delete partial.SELECT_DIRECTION;
    const { webapp } = wired(partial);
    expect(Object.keys(webapp.listeners).sort()).toEqual([
      "GetDirectionsEvent",
      "LocationSelectedEvent",
      "PhoneClickEvent",
      "SelectStoreEvent",
    ]);
  });
});

describe("the GA4 events", () => {
  it("names each interaction and tags it with the surface", () => {
    const { webapp, gtag } = wired();
    webapp.emit(EVENTS.SELECT_STORE, "1264");
    webapp.emit(
      EVENTS.GET_DIRECTIONS,
      "1264",
      { lat: 53.4, lng: -2.2 },
      { lat: 53.5, lng: -2.3 },
    );
    webapp.emit(EVENTS.LOCATION_SELECTED, {
      labelAddress: "12 Privacy Road, Manchester",
    });
    expect(gtag.mock.calls.map(([, name]) => name)).toEqual([
      "store_selected",
      "directions_shown",
      "search_location_selected",
    ]);
    expect(gtag.mock.calls[0]).toEqual([
      "event",
      "store_selected",
      { interaction_source: "locator", store_id: "1264" },
    ]);
  });

  it("reads the transport mode and nothing else from a chosen route", () => {
    const { webapp, gtag } = wired();
    webapp.emit(EVENTS.SELECT_DIRECTION, "1264", {
      transportMode: "DRIVING",
      summary: "A56",
      start: {
        address: "4 Visitor Street, Salford",
        location: { lat: 53.48, lng: -2.29 },
      },
    });
    expect(gtag.mock.calls[0][2]).toEqual({
      interaction_source: "locator",
      store_id: "1264",
      transport_mode: "DRIVING",
    });
    webapp.emit(EVENTS.SELECT_DIRECTION, "1264", undefined);
    expect(gtag.mock.calls[1][2]).toEqual({
      interaction_source: "locator",
      store_id: "1264",
    });
  });

  it("sends no phone number, no email and no searched address", () => {
    const { webapp, gtag } = wired();
    webapp.emit(EVENTS.PHONE_CLICK, "1264", "+441611234567");
    webapp.emit(EVENTS.EMAIL_CLICK, "1264", "manager@example.com");
    webapp.emit(EVENTS.LOCATION_SELECTED, {
      labelAddress: "12 Privacy Road, Manchester",
      name: "Manchester",
    });
    const sent = JSON.stringify(gtag.mock.calls);
    expect(gtag.mock.calls.map(([, name]) => name)).toEqual([
      "call_click",
      "email_click",
      "search_location_selected",
    ]);
    expect(sent).not.toContain("441611234567");
    expect(sent).not.toContain("example.com");
    expect(sent).not.toContain("Privacy Road");
    expect(sent).not.toContain("Manchester");
  });

  it("carries no store id when the payload is not one", () => {
    const { webapp, gtag } = wired();
    webapp.emit(EVENTS.LOCATION_SELECTED, { labelAddress: "anywhere" });
    expect(gtag.mock.calls[0][2]).toEqual({ interaction_source: "locator" });
  });
});

describe("initContainer analytics wiring", () => {
  /** Render `count` containers on one page, as a theme with several blocks does. */
  function renderBlocks(config, count = 1, gtag) {
    const webapp = trackedWebApp();
    const win = {
      WebApp: function () {
        return webapp;
      },
      matchMedia: () => ({ matches: false }),
      gtag,
    };
    for (let i = 0; i < count; i += 1) {
      initContainer(container(config, `c${i}`), win, document);
    }
    return { webapp, win };
  }

  it("measures nothing while the shop has not turned events on", () => {
    const gtag = vi.fn();
    const { webapp } = renderBlocks(SETTINGS, 1, gtag);
    webapp.emit(EVENTS.SELECT_STORE, "S1");
    // Wired but silent: the switch is read when the event fires, so re-ticking it in the
    // theme editor works without a reload.
    expect(gtag).not.toHaveBeenCalled();
  });

  it("wires the bus once, however many blocks the page has", () => {
    const gtag = vi.fn();
    const { webapp } = renderBlocks(
      { ...SETTINGS, trackEvents: true },
      3,
      gtag,
    );
    expect(Object.keys(webapp.listeners).sort()).toEqual(SUBSCRIBED);
    Object.values(webapp.listeners).forEach((registered) =>
      expect(registered).toHaveLength(1),
    );
  });
});
