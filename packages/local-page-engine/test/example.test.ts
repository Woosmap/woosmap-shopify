import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXAMPLE_JSON, EXAMPLE_PAGE } from '../examples/example-page';

// The committed reference document is what a client's developer reads to judge
// whether they can consume the feed. Without this guard it silently rots the first
// time the model changes — and a stale example is worse than none.

const COMMITTED = join(
  dirname(fileURLToPath(import.meta.url)),
  '../examples/local-page.example.json',
);

describe('local-page.example.json', () => {
  it('matches the model — run `pnpm example` if this fails', () => {
    expect(readFileSync(COMMITTED, 'utf8')).toBe(EXAMPLE_JSON);
  });

  it('exercises every enrichment slice, so the example is not a degenerate case', () => {
    expect([
      EXAMPLE_PAGE.admin !== null,
      EXAMPLE_PAGE.nearby !== null,
      (EXAMPLE_PAGE.nearbyStores?.length ?? 0) > 0,
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
