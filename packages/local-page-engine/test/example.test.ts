import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXAMPLE_JSON, EXAMPLE_PAGE } from '../examples/example-page';
import { EXAMPLE_AREA_JSON, EXAMPLE_AREA_PAGE } from '../examples/example-area-page';

// The committed reference document is what a client's developer reads to judge
// whether they can consume the feed. Without this guard it silently rots the first
// time the model changes — and a stale example is worse than none.

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), '../examples');
const COMMITTED = join(EXAMPLES, 'local-page.example.json');

describe('local-page.example.json', () => {
  it('matches the model, run `pnpm example` if this fails', () => {
    expect(readFileSync(COMMITTED, 'utf8')).toBe(EXAMPLE_JSON);
  });

  it('exercises every enrichment slice, so the example is not a degenerate case', () => {
    expect([
      EXAMPLE_PAGE.admin !== null,
      EXAMPLE_PAGE.subject.nearby !== null,
      (EXAMPLE_PAGE.subject.nearbyStores?.length ?? 0) > 0,
      EXAMPLE_PAGE.map !== null,
      EXAMPLE_PAGE.jsonLd.length,
    ]).toEqual([true, true, true, true, 2]);
  });

  it('shows every configurable knob resolved, so none can silently go inert', () => {
    expect([
      EXAMPLE_PAGE.canonicalUrl,
      EXAMPLE_PAGE.locale,
      EXAMPLE_PAGE.directionsProvider,
    ]).toEqual(['https://shop.example.com/pages/stores/fr-0421', 'en-GB', 'google']);
  });
});

describe('area-page.example.json', () => {
  it('matches the model, run `pnpm example` if this fails', () => {
    expect(readFileSync(join(EXAMPLES, 'area-page.example.json'), 'utf8')).toBe(EXAMPLE_AREA_JSON);
  });

  it('shows an area with a parent, children of its own and listed stores', () => {
    expect([
      EXAMPLE_AREA_PAGE.subject.trail.length,
      EXAMPLE_AREA_PAGE.subject.stores.length,
      EXAMPLE_AREA_PAGE.subject.stores[0]!.map !== null,
      EXAMPLE_AREA_PAGE.jsonLd.length,
    ]).toEqual([2, 4, true, 1]);
  });
});
