// Runnable entry for the scheduled PULL sync (a cron target):
//   SHOPIFY_SHOP=… SHOPIFY_ADMIN_TOKEN=… WOOSMAP_PRIVATE_KEY=… pnpm --filter woosmap-store-pages sync
//
// It wires the real dependencies to the pure `syncStores` logic. In the embedded
// Remix app you'd instead call `syncStores` from a resource route, passing an
// executor built from the request's `admin.graphql`.
import { createStoreClient } from './woosmap.server';
import {
  DEFAULT_STORE_METAOBJECT_TYPE,
  createFetchExecutor,
  ensureStoreDefinition,
  upsertStoreMetaobject,
} from './admin-graphql.server';
import { syncStores } from './store-sync.server';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

async function main(): Promise<void> {
  const shop = requireEnv('SHOPIFY_SHOP');
  const accessToken = requireEnv('SHOPIFY_ADMIN_TOKEN');
  // Merchant-owned `store` by default (any admin token can manage it). Override with
  // STORE_METAOBJECT_TYPE to target an existing definition of another type.
  const type = process.env.STORE_METAOBJECT_TYPE ?? DEFAULT_STORE_METAOBJECT_TYPE;
  // Publish synced pages by default; STORE_SYNC_DRAFT=true stages them as DRAFT.
  const status = process.env.STORE_SYNC_DRAFT === 'true' ? 'DRAFT' : 'ACTIVE';

  const execute = createFetchExecutor({
    shop,
    accessToken,
    ...(process.env.SHOPIFY_API_VERSION ? { apiVersion: process.env.SHOPIFY_API_VERSION } : {}),
  });
  const client = createStoreClient();

  // Create the merchant-owned definition on first run, else ensure its capabilities
  // (public URL + SEO mapping). Idempotent.
  const outcome = await ensureStoreDefinition(execute, {
    type,
    urlHandle: process.env.STORE_URL_HANDLE ?? 'stores',
  });
  if (outcome === 'created') {
    console.log('Created the merchant-owned `store` metaobject definition (online_store + renderable SEO + publishable).');
  } else if (outcome === 'updated') {
    console.log('Updated the store metaobject definition capabilities.');
  }

  const result = await syncStores(
    {
      source: client,
      upsert: ({ handle, fields }) => upsertStoreMetaobject(execute, { type, handle, fields, status }),
      onProgress: (event) => {
        if (event.status === 'failed') {
          console.error(`  ✗ ${event.storeId}: ${event.error}`);
        }
      },
    },
    process.env.SYNC_SINCE ? { since: process.env.SYNC_SINCE } : {},
  );

  console.log(
    `Sync done: ${result.upserted} upserted (${status}), ${result.skipped} skipped, ${result.failed} failed (of ${result.total}).`,
  );
  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
