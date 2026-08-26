/**
 * Write `local-page.example.json` — the reference output of the page model.
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

const out = join(dirname(fileURLToPath(import.meta.url)), 'local-page.example.json');
writeFileSync(out, EXAMPLE_JSON, 'utf8');
console.log(`Wrote ${out}`);
