// The store sync: pull stores from Woosmap, upsert one Shopify metaobject each.
//
// Shopify cannot pull or cron on its own, so the app drives this (with a shop
// token). The default model is a SCHEDULED PULL: run it on a cron, optionally
// incrementally via `since` (Woosmap `last_updated`). It is idempotent and
// re-runnable — one metaobject per store, keyed by a stable handle — so a failed
// or partial run can simply be run again. A Woosmap inbound webhook can reuse the
// same `upsertOne` path for a single store.
import {
  featureToStore,
  type Store,
  type StoreFeature,
  type StoresSearchRequest,
} from '@woosmap/store-search-client';
import {
  buildLocalPage,
  storeSlug,
  type LocalPageConfig,
  type LocalPageEnrichment,
} from '@woosmap/local-page-engine';
import { localPageToMetaobjectFields, type MetaobjectFieldInput } from './metaobject-mapping.server';

/**
 * Merge the enrichment slices several independent enrichers resolved for one store.
 *
 * Spelt out rather than `Object.assign(...)` + a cast: each enricher owns exactly one
 * slice, so two of them writing the same one is a wiring mistake, and a spread would
 * swallow it — last writer wins, silently, with the compiler talked out of the way.
 * Here the first writer keeps the slice and `onCollision` gets told. Not fatal: an
 * enrichment problem must never cost a store its base facts.
 *
 * `undefined` means "did not resolve" and never overwrites a slice someone else
 * filled. `null` and `[]` are resolved values and do carry through — that is how the
 * neighbour search says "this store has none any more".
 */
export function mergeEnrichment(
  parts: LocalPageEnrichment[],
  onCollision?: (key: keyof LocalPageEnrichment) => void,
): LocalPageEnrichment {
  const merged: LocalPageEnrichment = {};
  for (const part of parts) {
    for (const key of Object.keys(part) as Array<keyof LocalPageEnrichment>) {
      if (part[key] === undefined) {
        continue;
      }
      if (key in merged) {
        onCollision?.(key);
        continue;
      }
      Object.assign(merged, { [key]: part[key] });
    }
  }
  return merged;
}

/** Just the client surface the sync needs — narrow, so tests inject a fake. */
export interface StoreSource {
  iterateStores(request?: StoresSearchRequest): AsyncIterable<StoreFeature>;
}

/** Upserts one metaobject. Wraps `upsertStoreMetaobject` in production. */
export type MetaobjectUpserter = (input: {
  handle: string;
  fields: MetaobjectFieldInput[];
}) => Promise<{ id: string; handle: string }>;

/** Dependencies for {@link syncStores}, all injected for testability. */
export interface SyncDeps {
  source: StoreSource;
  upsert: MetaobjectUpserter;
  /** Optional progress hook (e.g. logging). */
  onProgress?: (event: SyncProgress) => void;
  /**
   * Optional per-store enrichment. Returns whatever was resolved — an empty object
   * carries nothing, so the mapper emits no enrichment keys and `metaobjectUpsert`
   * leaves any existing values untouched. A throw is caught and does not abort the
   * run: the store is still upserted with its base facts.
   */
  enrich?: (store: Store) => Promise<LocalPageEnrichment>;
  /** Per-client page config (branding, url base, SEO templates, map geometry). */
  pageConfig?: LocalPageConfig;
  /** Injected clock (ISO string), so a run is reproducible in tests. */
  now?: () => string;
}

/** Options controlling which stores are synced. */
export interface SyncOptions {
  /**
   * Incremental sync: only stores whose `last_updated` is at or after this ISO
   * timestamp. Composed into the Woosmap query as `last_updated:>="…"`.
   */
  since?: string;
  /** Extra Woosmap query clause, AND-combined with `since`. */
  query?: string;
}

/** A per-store progress event. */
export interface SyncProgress {
  storeId: string;
  handle: string;
  status: 'upserted' | 'skipped' | 'failed';
  error?: string;
}

/** Summary returned by {@link syncStores}. */
export interface SyncResult {
  total: number;
  upserted: number;
  skipped: number;
  failed: number;
  errors: Array<{ storeId: string; message: string }>;
}

/**
 * Build the Woosmap query string for a sync, combining an incremental `since`
 * bound with any extra clause. Returns `undefined` when neither is set (full sync).
 */
export function buildSyncQuery(options: SyncOptions = {}): string | undefined {
  const clauses: string[] = [];
  if (options.since) {
    clauses.push(`last_updated:>="${options.since}"`);
  }
  if (options.query) {
    clauses.push(options.query);
  }
  if (clauses.length === 0) {
    return undefined;
  }
  return clauses.join(' AND ');
}

/**
 * Run a sync. Iterates matching Woosmap stores, builds a platform-neutral
 * `LocalPage` for each, maps it to metaobject fields, and upserts it. One store
 * failing does not abort the run — the error is collected and the sync continues,
 * so a bad record can't block the rest.
 *
 * The page is built here rather than in the mapper on purpose: the same document
 * is what a feed or a server-rendered page would consume, so this loop is the only
 * Shopify-specific thing left in the pipeline.
 */
export async function syncStores(deps: SyncDeps, options: SyncOptions = {}): Promise<SyncResult> {
  const query = buildSyncQuery(options);
  const request: StoresSearchRequest | undefined = query ? { query } : undefined;
  const clock = deps.now ?? ((): string => new Date().toISOString());

  const result: SyncResult = { total: 0, upserted: 0, skipped: 0, failed: 0, errors: [] };

  for await (const feature of deps.source.iterateStores(request)) {
    result.total += 1;
    const store = featureToStore(feature);
    const handle = storeSlug(store.storeId);

    // A store with no id/name can't produce a valid, addressable metaobject.
    if (!store.storeId || !store.name || !handle) {
      result.skipped += 1;
      report(deps, { storeId: store.storeId, handle, status: 'skipped' });
      continue;
    }

    try {
      let enrichment: LocalPageEnrichment = {};
      if (deps.enrich) {
        try {
          enrichment = await deps.enrich(store);
        } catch {
          // Enrichment must never block the base upsert — ship the facts alone.
        }
      }
      const page = buildLocalPage(store, enrichment, deps.pageConfig ?? {}, { now: clock() });
      const fields = localPageToMetaobjectFields(page);
      await deps.upsert({ handle, fields });
      result.upserted += 1;
      report(deps, { storeId: store.storeId, handle, status: 'upserted' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed += 1;
      result.errors.push({ storeId: store.storeId, message });
      report(deps, { storeId: store.storeId, handle, status: 'failed', error: message });
    }
  }

  return result;
}

function report(deps: SyncDeps, event: SyncProgress): void {
  if (deps.onProgress) {
    deps.onProgress(event);
  }
}
