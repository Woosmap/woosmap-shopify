/**
 * Write the reference outputs of the page model, one per kind of page.
 *
 * The example is committed on purpose: a JSON document people can read is worth
 * more in a review than the TypeScript type, and it is what a client's developer
 * would be handed to decide whether they can consume the feed.
 * `test/example.test.ts` fails if the committed file drifts from the model.
 *
 * Run: `pnpm --filter @woosmap/local-page-engine example`
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EXAMPLE_JSON } from './example-page';
import { EXAMPLE_AREA_JSON } from './example-area-page';

const here = dirname(fileURLToPath(import.meta.url));

writeFileSync(join(here, 'local-page.example.json'), EXAMPLE_JSON, 'utf8');
writeFileSync(join(here, 'area-page.example.json'), EXAMPLE_AREA_JSON, 'utf8');
console.log(`Wrote local-page.example.json and area-page.example.json in ${here}`);
