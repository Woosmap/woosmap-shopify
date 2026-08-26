// Runnable entry for the scheduled PULL sync (a cron target):
//   SHOPIFY_SHOP=… SHOPIFY_ADMIN_TOKEN=… WOOSMAP_PRIVATE_KEY=… pnpm --filter woosmap-store-pages sync
//
// It wires the real dependencies to the pure `syncStores` logic. In the embedded
// Remix app you'd instead call `syncStores` from a resource route, passing an
// executor built from the request's `admin.graphql`.
import { featureToStore, type Store } from '@woosmap/store-search-client';
import { createStoreClient } from './woosmap.server';
import {
  DEFAULT_STORE_METAOBJECT_TYPE,
  createFetchExecutor,
  ensureStoreDefinition,
  listStoreAdminPresence,
  listStoreNearbyTimestamps,
  upsertStoreMetaobject,
} from './admin-graphql.server';
import { mergeEnrichment, syncStores } from './store-sync.server';
import {
  buildStoreIndex,
  enrichNearby,
  findNearbyStores,
  hasAdmin,
  isNearbyStale,
  parseNearbyGroups,
  reverseGeocode,
  storeSlug,
  type LocalPageEnrichment,
} from '@woosmap/local-page-engine';

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

  // Where the pages live. One expression, used by the definition's url handle, the
  // page's canonical path and the neighbour links — they cannot be allowed to drift.
  const urlHandle = process.env.STORE_URL_HANDLE ?? 'stores';
  const urlBase = `/pages/${urlHandle}`;

  // Create the merchant-owned definition on first run, else ensure its capabilities
  // (public URL + SEO mapping). Idempotent.
  const outcome = await ensureStoreDefinition(execute, { type, urlHandle });
  if (outcome === 'created') {
    console.log('Created the merchant-owned `store` metaobject definition (online_store + renderable SEO + publishable).');
  } else if (outcome === 'updated') {
    console.log('Updated the store metaobject definition capabilities.');
  }

  // Optional server-side enrichment (SEO/GEO), composed from independent steps.
  // Each returns the slice of the page it resolved; an empty object carries nothing,
  // so the mapper emits no key and metaobjectUpsert leaves existing values untouched.
  const enrichers: Array<(store: Store) => Promise<LocalPageEnrichment>> = [];
  const nearby = { refreshed: 0, kept: 0 };
  const admin = { filled: 0, kept: 0 };
  const nearbyStores = { withNeighbours: 0, alone: 0 };

  // Nearby POIs — gated by ENRICH_NEARBY, self-paced by a TTL (missing or older
  // than NEARBY_MAX_AGE_DAYS). Existing timestamps are bulk-read once.
  if (process.env.ENRICH_NEARBY === 'true') {
    const woosmapPrivateKey = requireEnv('WOOSMAP_PRIVATE_KEY');
    const maxAgeDays = Number(process.env.NEARBY_MAX_AGE_DAYS ?? '30');
    // Which POI families to fetch — default retail set, override with NEARBY_GROUPS_JSON.
    // Parsed once here so a bad config throws before any store is processed.
    const groups = parseNearbyGroups(process.env.NEARBY_GROUPS_JSON);
    const now = new Date();
    const timestamps = await listStoreNearbyTimestamps(execute, { type });
    enrichers.push(async (store) => {
      if (store.lat === null || store.lng === null) return {};
      const handle = storeSlug(store.storeId);
      if (!isNearbyStale(timestamps.get(handle), maxAgeDays, now)) {
        nearby.kept += 1;
        return {}; // fresh → leave the existing `nearby` untouched
      }
      const data = await enrichNearby(fetch, woosmapPrivateKey, store.lat, store.lng, now.toISOString(), groups);
      nearby.refreshed += 1;
      return { nearby: data };
    });
    console.log(`Nearby enrichment ON (TTL ${maxAgeDays} days, ${groups.length} group(s)).`);
  }

  // Administrative hierarchy — gated by ENRICH_ADMIN. Fill-once: only stores that
  // don't already have it (boundaries don't change; a new store gets filled later).
  if (process.env.ENRICH_ADMIN === 'true') {
    const woosmapPrivateKey = requireEnv('WOOSMAP_PRIVATE_KEY');
    const present = await listStoreAdminPresence(execute, { type });
    enrichers.push(async (store) => {
      if (store.lat === null || store.lng === null) return {};
      const handle = storeSlug(store.storeId);
      if (present.has(handle)) {
        admin.kept += 1;
        return {}; // already enriched
      }
      const areas = await reverseGeocode(fetch, woosmapPrivateKey, store.lat, store.lng);
      if (!hasAdmin(areas)) return {};
      admin.filled += 1;
      return { admin: areas };
    });
    console.log('Admin enrichment ON (fill-once, no TTL).');
  }

  // Neighbouring stores — gated by ENRICH_NEARBY_STORES. Recomputed every run
  // (cheap, in-memory) so a new store shows up on its neighbours' pages. Needs the
  // full store set up front: one extra pull builds an in-memory spatial index.
  if (process.env.ENRICH_NEARBY_STORES === 'true') {
    const radiusKm = Number(process.env.NEARBY_STORES_RADIUS_KM ?? '10');
    const limit = Number(process.env.NEARBY_STORES_LIMIT ?? '3');
    const allStores: Store[] = [];
    for await (const feature of client.iterateStores()) {
      allStores.push(featureToStore(feature));
    }
    const index = buildStoreIndex(allStores);
    console.log(
      `Nearby-stores enrichment ON (radius ${radiusKm} km, up to ${limit}); indexed ${index.length} stores.`,
    );
    enrichers.push(async (store) => {
      const list = findNearbyStores(store, index, { radiusKm, limit, urlBase });
      if (list.length > 0) {
        nearbyStores.withNeighbours += 1;
      } else {
        nearbyStores.alone += 1;
      }
      // Always a resolved value, `[]` included: the search ran, so the stored list is
      // replaced. Omitting it for a store with no neighbour left would keep rendering
      // yesterday's links.
      return { nearbyStores: list };
    });
  }

  const enrich =
    enrichers.length > 0
      ? async (store: Store): Promise<LocalPageEnrichment> => {
          const parts = await Promise.all(enrichers.map((run) => run(store)));
          return mergeEnrichment(parts, (key) =>
            console.error(`  ! two enrichers both resolved \`${key}\`; keeping the first.`),
          );
        }
      : undefined;

  const result = await syncStores(
    {
      source: client,
      // Per-client page config. The public key is optional here: the Shopify theme
      // reads its own, so the sync only needs it if a consumer wants the map URL
      // baked into the document (a feed would). STORE_PAGE_ORIGIN likewise — Liquid
      // has `canonical_url`, so only an off-platform consumer needs absolute URLs.
      pageConfig: {
        urlBase,
        ...(process.env.WOOSMAP_PUBLIC_KEY ? { publicKey: process.env.WOOSMAP_PUBLIC_KEY } : {}),
        ...(process.env.STORE_BRAND ? { brand: process.env.STORE_BRAND } : {}),
        ...(process.env.STORE_PAGE_ORIGIN ? { origin: process.env.STORE_PAGE_ORIGIN } : {}),
        ...(process.env.STORE_LOCALE ? { locale: process.env.STORE_LOCALE } : {}),
      },
      upsert: ({ handle, fields }) => upsertStoreMetaobject(execute, { type, handle, fields, status }),
      onProgress: (event) => {
        if (event.status === 'failed') {
          console.error(`  ✗ ${event.storeId}: ${event.error}`);
        }
      },
      ...(enrich ? { enrich } : {}),
    },
    process.env.SYNC_SINCE ? { since: process.env.SYNC_SINCE } : {},
  );

  console.log(
    `Sync done: ${result.upserted} upserted (${status}), ${result.skipped} skipped, ${result.failed} failed (of ${result.total}).`,
  );
  if (process.env.ENRICH_NEARBY === 'true') {
    console.log(`Nearby: ${nearby.refreshed} refreshed, ${nearby.kept} still fresh (within TTL).`);
  }
  if (process.env.ENRICH_ADMIN === 'true') {
    console.log(`Admin: ${admin.filled} enriched, ${admin.kept} already had it.`);
  }
  if (process.env.ENRICH_NEARBY_STORES === 'true') {
    console.log(
      `Nearby stores: ${nearbyStores.withNeighbours} with neighbours, ${nearbyStores.alone} with none in radius.`,
    );
  }
  if (result.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
