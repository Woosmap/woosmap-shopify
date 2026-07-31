import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildConf,
  parseConf,
  ensureWebApp,
  readConfig,
  initContainer,
  initAll,
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
