import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildConf,
  parseConf,
  ensureWebApp,
  readConfig,
  initContainer,
  initAll,
  setupCooperativeZoom,
  renderFilterChoice,
  renderFilterPanel,
} from '../extensions/store-locator/assets/store-locator.js';

const SETTINGS = {
  publicKey: 'woos-public',
  advancedJson: '{"datasource":{"maxResponses":7},"internationalization":{"lang":"fr"}}',
};

/** Build a container div with an embedded JSON config script (as the block emits). */
function container(config, id = 'c1') {
  const el = document.createElement('div');
  el.id = id;
  el.setAttribute('data-woosmap-store-locator', '');
  if (config !== undefined) {
    const script = document.createElement('script');
    script.type = 'application/json';
    script.className = 'woosmap-store-locator__config';
    script.textContent = typeof config === 'string' ? config : JSON.stringify(config);
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
  document.body.innerHTML = '';
});

describe('parseConf', () => {
  it('parses strict JSON into { conf, error }', () => {
    expect(parseConf('{"a":1,"b":{"c":true}}')).toEqual({ conf: { a: 1, b: { c: true } }, error: null });
  });

  it('returns {} and an error message on invalid JSON', () => {
    const result = parseConf('{ oops ');
    expect(result.conf).toEqual({});
    expect(result.error).toBeTruthy();
  });

  it('treats a non-object JSON value as empty, with an error', () => {
    expect(parseConf('[1,2]')).toEqual({ conf: {}, error: 'Configuration must be a JSON object.' });
  });

  it('returns {} with no error when blank or absent', () => {
    expect(parseConf('   ')).toEqual({ conf: {}, error: null });
    expect(parseConf(undefined)).toEqual({ conf: {}, error: null });
  });
});

describe('buildConf', () => {
  it('returns just the parsed conf', () => {
    expect(buildConf(SETTINGS)).toEqual({ datasource: { maxResponses: 7 }, internationalization: { lang: 'fr' } });
  });

  it('returns {} when the field is blank, absent, or invalid', () => {
    expect(buildConf({ publicKey: 'x' })).toEqual({});
    expect(buildConf({ advancedJson: '{ bad' })).toEqual({});
    expect(buildConf()).toEqual({});
  });
});

describe('readConfig', () => {
  it('parses the embedded JSON config', () => {
    expect(readConfig(container(SETTINGS)).publicKey).toBe('woos-public');
  });

  it('returns null when the config script is missing', () => {
    const el = document.createElement('div');
    expect(readConfig(el)).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(readConfig(container('{ not json'))).toBeNull();
  });
});

describe('renderFilterChoice', () => {
  it('renders a labelled choice with a service icon (sample structure), not active by default', () => {
    const el = renderFilterChoice('Pep Shop', 'Pep Shop', false);
    expect(el.classList.contains('wsl-filter')).toBe(true);
    expect(el.classList.contains('active')).toBe(false);
    expect(el.querySelector('button')).toBeTruthy();
    expect(el.querySelector('.flex-grow').textContent).toBe('Pep Shop');
    expect(el.querySelector('.icon-service svg')).toBeTruthy();
    expect(el.querySelector('.active-icon-wrapper svg')).toBeTruthy(); // tick present, hidden via CSS until active
  });

  it('marks the choice active when selected', () => {
    const el = renderFilterChoice('Ice Store', 'Ice Store', true);
    expect(el.classList.contains('active')).toBe(true);
  });

  it('uses distinct icons per known tag and a neutral fallback for unknown ones', () => {
    const pep = renderFilterChoice('Pep Shop', 'Pep Shop', false).querySelector('.icon-service').innerHTML;
    const ice = renderFilterChoice('Ice Store', 'Ice Store', false).querySelector('.icon-service').innerHTML;
    const other = renderFilterChoice('Parking', 'Parking', false).querySelector('.icon-service').innerHTML;
    expect(pep).not.toBe(ice);
    expect(other).toContain('<circle'); // neutral dot fallback
    expect(pep).not.toContain('<circle');
  });
});

describe('renderFilterPanel', () => {
  it('wraps the group header + choices in a .filters-list container (as the sample does)', () => {
    const choices = [
      renderFilterChoice('Ice Store', 'Ice Store', false),
      renderFilterChoice('Pep Shop', 'Pep Shop', true),
    ];
    const panel = renderFilterPanel('Services', choices);
    expect(panel.classList.contains('filters-list')).toBe(true);
    expect(panel.querySelector('.filter-group').textContent).toBe('Services');
    expect(panel.querySelectorAll('.wsl-filter').length).toBe(2); // both choices appended
  });

  it('resolves a localized title object to its text', () => {
    const panel = renderFilterPanel({ en: 'Amenities' }, []);
    expect(panel.querySelector('.filter-group').textContent).toBe('Amenities');
  });
});

describe('ensureWebApp', () => {
  it('runs the callback synchronously when WebApp is already present', () => {
    const win = { WebApp: function () {} };
    const cb = vi.fn();
    ensureWebApp(win, document, cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('injects the script once and flushes all queued callbacks on load', () => {
    const win = {};
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    ensureWebApp(win, document, cb1);
    ensureWebApp(win, document, cb2); // queued behind the same load

    const scripts = document.head.querySelectorAll('script');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe('https://webapp.woosmap.com/webapp.js');
    expect(cb1).not.toHaveBeenCalled();

    scripts[0].onload();
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});

describe('initContainer', () => {
  it('constructs the widget with the public key and sets the parsed conf', () => {
    const app = fakeWebApp();
    const win = { WebApp: app.ctor, matchMedia: () => ({ matches: false }) };
    const el = container(SETTINGS);

    initContainer(el, win, document);

    expect(app.ctor).toHaveBeenCalledWith('c1', 'woos-public');
    expect(app.setConf).toHaveBeenCalledWith(buildConf(SETTINGS));
    expect(app.render).toHaveBeenCalledWith(false);
    expect(el.dataset.wslRendered).toBe('true');
  });

  it('passes true to render on a mobile viewport', () => {
    const app = fakeWebApp();
    const win = { WebApp: app.ctor, matchMedia: () => ({ matches: true }) };
    initContainer(container(SETTINGS), win, document);
    expect(app.render).toHaveBeenCalledWith(true);
  });

  it('does nothing when the public key is missing (shows setup message instead)', () => {
    const app = fakeWebApp();
    const win = { WebApp: app.ctor, matchMedia: () => ({ matches: false }) };
    initContainer(container({ ...SETTINGS, publicKey: '' }), win, document);
    expect(app.ctor).not.toHaveBeenCalled();
  });

  it('surfaces a config error in the theme editor and still renders with defaults', () => {
    const app = fakeWebApp();
    const win = { WebApp: app.ctor, matchMedia: () => ({ matches: false }), Shopify: { designMode: true } };
    const el = container({ publicKey: 'woos-public', advancedJson: '{ broken' });

    initContainer(el, win, document);

    expect(el.querySelector('.woosmap-store-locator__error')).not.toBeNull();
    expect(app.setConf).toHaveBeenCalledWith({}); // falls back to empty conf
    expect(app.render).toHaveBeenCalled();
  });

  it('stays silent on the live storefront (no design mode) when the config is invalid', () => {
    const app = fakeWebApp();
    const win = { WebApp: app.ctor, matchMedia: () => ({ matches: false }) };
    const el = container({ publicKey: 'woos-public', advancedJson: '{ broken' });

    initContainer(el, win, document);

    expect(el.querySelector('.woosmap-store-locator__error')).toBeNull();
    expect(app.setConf).toHaveBeenCalledWith({});
  });

  it('is idempotent: a second call does not re-render', () => {
    const app = fakeWebApp();
    const win = { WebApp: app.ctor, matchMedia: () => ({ matches: false }) };
    const el = container(SETTINGS);
    initContainer(el, win, document);
    initContainer(el, win, document);
    expect(app.ctor).toHaveBeenCalledTimes(1);
  });

  it('ignores a missing element and invalid embedded config', () => {
    const app = fakeWebApp();
    const win = { WebApp: app.ctor, matchMedia: () => ({ matches: false }) };
    initContainer(null, win, document);
    initContainer(container('{bad'), win, document);
    expect(app.ctor).not.toHaveBeenCalled();
  });
});

describe('setupCooperativeZoom', () => {
  /** A container with (optionally) a GL map child, mirroring what the widget mounts. */
  function mapHost(withMap = true, mapClass = 'mapboxgl-map', id = 'm1') {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
    if (withMap) {
      const map = document.createElement('div');
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
    const ev = new Event('wheel', { bubbles: true, cancelable: true });
    ev.ctrlKey = modifier === 'ctrl';
    ev.metaKey = modifier === 'meta';
    vi.spyOn(ev, 'stopPropagation');
    vi.spyOn(ev, 'preventDefault');
    return ev;
  }

  it('attaches to the map and injects the English hint', () => {
    const el = mapHost();
    setupCooperativeZoom(el, zoomWin(), document);
    const map = el.querySelector('.mapboxgl-map');

    expect(map.__wslCoopZoom).toBe(true);
    const hint = map.querySelector('.woosmap-store-locator__zoom-hint');
    expect(hint).not.toBeNull();
    expect(hint.textContent).toBe('Use Ctrl + scroll to zoom');
    expect(hint.style.opacity).toBe('0');
  });

  it('blocks the map zoom and flashes the hint on a plain wheel, without preventing page scroll', () => {
    const el = mapHost();
    setupCooperativeZoom(el, zoomWin(), document);
    const map = el.querySelector('.mapboxgl-map');
    const hint = map.querySelector('.woosmap-store-locator__zoom-hint');

    const ev = wheel(null);
    map.dispatchEvent(ev);

    expect(ev.stopPropagation).toHaveBeenCalled(); // map won't zoom
    expect(ev.preventDefault).not.toHaveBeenCalled(); // page keeps scrolling
    expect(hint.style.opacity).toBe('1'); // hint shown
  });

  it('lets the map zoom (no block, no hint) when Ctrl or ⌘ is held', () => {
    const el = mapHost();
    setupCooperativeZoom(el, zoomWin(), document);
    const map = el.querySelector('.mapboxgl-map');
    const hint = map.querySelector('.woosmap-store-locator__zoom-hint');

    const ctrl = wheel('ctrl');
    map.dispatchEvent(ctrl);
    const meta = wheel('meta');
    map.dispatchEvent(meta);

    expect(ctrl.stopPropagation).not.toHaveBeenCalled();
    expect(meta.stopPropagation).not.toHaveBeenCalled();
    expect(hint.style.opacity).toBe('0');
  });

  it('attaches once the map mounts asynchronously (MutationObserver)', async () => {
    const el = mapHost(false); // no map yet at render time
    setupCooperativeZoom(el, zoomWin(), document);

    const map = document.createElement('div');
    map.className = 'maplibregl-map';
    el.appendChild(map);
    await new Promise((resolve) => setTimeout(resolve, 0)); // let the observer fire

    expect(map.__wslCoopZoom).toBe(true);
    expect(map.querySelector('.woosmap-store-locator__zoom-hint')).not.toBeNull();
  });

  it('does not attach twice to the same map', () => {
    const el = mapHost();
    const win = zoomWin();
    setupCooperativeZoom(el, win, document);
    setupCooperativeZoom(el, win, document);
    const map = el.querySelector('.mapboxgl-map');
    expect(map.querySelectorAll('.woosmap-store-locator__zoom-hint')).toHaveLength(1);
  });
});

describe('initAll', () => {
  it('initialises every container in the document', () => {
    const app = fakeWebApp();
    const win = { WebApp: app.ctor, matchMedia: () => ({ matches: false }) };
    container(SETTINGS, 'a');
    container({ ...SETTINGS, publicKey: 'woos-b' }, 'b');

    initAll(win, document);

    expect(app.ctor).toHaveBeenCalledTimes(2);
    expect(app.ctor).toHaveBeenCalledWith('a', 'woos-public');
    expect(app.ctor).toHaveBeenCalledWith('b', 'woos-b');
  });
});
