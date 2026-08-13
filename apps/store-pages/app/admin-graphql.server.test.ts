import { describe, it, expect, vi, type Mock } from 'vitest';
import { STORE_FIELD_DEFINITIONS } from '@woosmap/store-search-client';
import {
  AdminGraphQLError,
  DEFAULT_STORE_METAOBJECT_TYPE,
  createFetchExecutor,
  ensureStoreDefinition,
  ensureStoreFields,
  ensureStorePageCapabilities,
  listStoreAdminPresence,
  listStoreNearbyTimestamps,
  upsertStoreMetaobject,
  type GraphQLExecutor,
} from './admin-graphql.server';

/** All current field keys, as the definition lookup returns them. */
const ALL_FIELD_DEFS = STORE_FIELD_DEFINITIONS.map((f) => ({ key: f.key }));

// GraphQLExecutor is generic (`<T>`), which vitest's Mock type can't express.
// Build a plain mock and cast it at the call site; `.mock.calls` stays available.
const asExecutor = (mock: Mock): GraphQLExecutor => mock as unknown as GraphQLExecutor;

describe('DEFAULT_STORE_METAOBJECT_TYPE', () => {
  it('is the merchant-owned store type (no $app: prefix)', () => {
    expect(DEFAULT_STORE_METAOBJECT_TYPE).toBe('store');
  });
});

describe('upsertStoreMetaobject', () => {
  it('sends the handle + fields, publishes (ACTIVE) by default, returns the metaobject', async () => {
    const execute = vi.fn().mockResolvedValue({
      data: { metaobjectUpsert: { metaobject: { id: 'gid://1', handle: 'store-a', type: 'store' }, userErrors: [] } },
    });

    const out = await upsertStoreMetaobject(asExecutor(execute), {
      handle: 'store-a',
      fields: [{ key: 'name', value: 'Store A' }],
    });

    expect(out).toEqual({ id: 'gid://1', handle: 'store-a' });
    const variables = execute.mock.calls[0]![1]!;
    expect(variables.handle).toEqual({ type: 'store', handle: 'store-a' });
    expect(variables.metaobject).toEqual({
      fields: [{ key: 'name', value: 'Store A' }],
      capabilities: { publishable: { status: 'ACTIVE' } },
    });
  });

  it('stages as DRAFT when asked', async () => {
    const execute = vi.fn().mockResolvedValue({
      data: { metaobjectUpsert: { metaobject: { id: '1', handle: 'h', type: 'store' }, userErrors: [] } },
    });
    await upsertStoreMetaobject(asExecutor(execute), { handle: 'h', fields: [], status: 'DRAFT' });
    expect(execute.mock.calls[0]![1]!.metaobject.capabilities).toEqual({ publishable: { status: 'DRAFT' } });
  });

  it('leaves publish status untouched when status is null', async () => {
    const execute = vi.fn().mockResolvedValue({
      data: { metaobjectUpsert: { metaobject: { id: '1', handle: 'h', type: 'store' }, userErrors: [] } },
    });
    await upsertStoreMetaobject(asExecutor(execute), { handle: 'h', fields: [], status: null });
    expect(execute.mock.calls[0]![1]!.metaobject.capabilities).toBeUndefined();
  });

  it('honours a caller-supplied fully-qualified type', async () => {
    const execute = vi.fn().mockResolvedValue({
      data: { metaobjectUpsert: { metaobject: { id: '1', handle: 'h', type: 't' }, userErrors: [] } },
    });
    await upsertStoreMetaobject(asExecutor(execute), { type: 'app--42--store', handle: 'h', fields: [] });
    expect(execute.mock.calls[0]![1]!.handle.type).toBe('app--42--store');
  });

  it('throws AdminGraphQLError on userErrors', async () => {
    const execute = vi.fn().mockResolvedValue({
      data: {
        metaobjectUpsert: {
          metaobject: null,
          userErrors: [{ field: ['fields', '2', 'value'], message: 'Invalid URL', code: 'INVALID' }],
        },
      },
    });
    await expect(upsertStoreMetaobject(asExecutor(execute), { handle: 'h', fields: [] })).rejects.toMatchObject({
      name: 'AdminGraphQLError',
    });
  });

  it('throws on top-level GraphQL errors', async () => {
    const execute = vi.fn().mockResolvedValue({ errors: [{ message: 'Throttled' }] });
    await expect(upsertStoreMetaobject(asExecutor(execute), { handle: 'h', fields: [] })).rejects.toThrow(/Throttled/);
  });

  it('throws when no metaobject is returned and there are no errors', async () => {
    const execute = vi.fn().mockResolvedValue({
      data: { metaobjectUpsert: { metaobject: null, userErrors: [] } },
    });
    await expect(upsertStoreMetaobject(asExecutor(execute), { handle: 'h', fields: [] })).rejects.toThrow(/no metaobject/);
  });
});

describe('ensureStorePageCapabilities', () => {
  const disabled = {
    data: {
      metaobjectDefinitionByType: {
        id: 'gid://def',
        capabilities: { onlineStore: { enabled: false }, renderable: { enabled: true, data: null } },
      },
    },
  };
  const fullyConfigured = {
    data: {
      metaobjectDefinitionByType: {
        id: 'gid://def',
        capabilities: {
          onlineStore: { enabled: true },
          renderable: { enabled: true, data: { metaTitleKey: 'name', metaDescriptionKey: 'description' } },
        },
      },
    },
  };

  it('enables online_store + renderable SEO mapping in one update and returns true', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(disabled)
      .mockResolvedValueOnce({ data: { metaobjectDefinitionUpdate: { metaobjectDefinition: { id: 'gid://def' }, userErrors: [] } } });

    const changed = await ensureStorePageCapabilities(asExecutor(execute), { urlHandle: 'stores' });

    expect(changed).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
    const updateVars = execute.mock.calls[1]![1]!;
    expect(updateVars.id).toBe('gid://def');
    expect(updateVars.definition).toEqual({
      capabilities: {
        onlineStore: { enabled: true, data: { urlHandle: 'stores' } },
        renderable: { enabled: true, data: { metaTitleKey: 'name', metaDescriptionKey: 'description' } },
      },
    });
  });

  it('is idempotent: returns false and does not update when both are already configured', async () => {
    const execute = vi.fn().mockResolvedValue(fullyConfigured);
    const changed = await ensureStorePageCapabilities(asExecutor(execute));
    expect(changed).toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('updates when online_store is on but the SEO mapping is missing', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          metaobjectDefinitionByType: {
            id: 'gid://def',
            capabilities: { onlineStore: { enabled: true }, renderable: { enabled: true, data: { metaTitleKey: 'other' } } },
          },
        },
      })
      .mockResolvedValueOnce({ data: { metaobjectDefinitionUpdate: { metaobjectDefinition: { id: 'gid://def' }, userErrors: [] } } });
    expect(await ensureStorePageCapabilities(asExecutor(execute))).toBe(true);
  });

  it('throws when the definition does not exist', async () => {
    const execute = vi.fn().mockResolvedValue({ data: { metaobjectDefinitionByType: null } });
    await expect(ensureStorePageCapabilities(asExecutor(execute))).rejects.toThrow(/No metaobject definition/);
  });

  it('throws on update userErrors', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(disabled)
      .mockResolvedValueOnce({ data: { metaobjectDefinitionUpdate: { metaobjectDefinition: null, userErrors: [{ message: 'nope' }] } } });
    await expect(ensureStorePageCapabilities(asExecutor(execute))).rejects.toThrow(/nope/);
  });

  it('defaults type/urlHandle/SEO keys when called with no options', async () => {
    const execute = vi.fn().mockResolvedValue(fullyConfigured);
    await ensureStorePageCapabilities(asExecutor(execute));
    expect(execute.mock.calls[0]![1]).toEqual({ type: 'store' });
  });
});

describe('ensureStoreDefinition', () => {
  const present = (
    data: unknown = { onlineStore: { enabled: false }, renderable: { enabled: true, data: null } },
    fieldDefinitions: Array<{ key: string }> = ALL_FIELD_DEFS,
  ) => ({
    data: { metaobjectDefinitionByType: { id: 'gid://def', fieldDefinitions, capabilities: data } },
  });

  it('creates the merchant-owned definition when absent, with fields + capabilities', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ data: { metaobjectDefinitionByType: null } })
      .mockResolvedValueOnce({
        data: { metaobjectDefinitionCreate: { metaobjectDefinition: { id: 'gid://def', type: 'store' }, userErrors: [] } },
      });

    const outcome = await ensureStoreDefinition(asExecutor(execute), { urlHandle: 'stores' });

    expect(outcome).toBe('created');
    const def = execute.mock.calls[1]![1]!.definition;
    expect(def.type).toBe('store');
    expect(def.access).toEqual({ storefront: 'PUBLIC_READ' }); // no admin access on a merchant-owned def
    expect(def.capabilities.onlineStore).toEqual({ enabled: true, data: { urlHandle: 'stores' } });
    expect(def.capabilities.renderable).toEqual({ enabled: true, data: { metaTitleKey: 'name', metaDescriptionKey: 'description' } });
    expect(def.capabilities.publishable).toEqual({ enabled: true });
    const keys = def.fieldDefinitions.map((f: { key: string }) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['store_id', 'name', 'lat', 'lng', 'hours', 'description']));
    expect(def.fieldDefinitions.find((f: { key: string }) => f.key === 'store_id').required).toBe(true);
  });

  it('configures capabilities when the definition already exists (returns updated)', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(present()) // ensureStoreDefinition's own lookup
      .mockResolvedValueOnce(present()) // ensureStorePageCapabilities re-looks-up
      .mockResolvedValueOnce({ data: { metaobjectDefinitionUpdate: { metaobjectDefinition: { id: 'gid://def' }, userErrors: [] } } })
      .mockResolvedValueOnce(present()); // ensureStoreFields lookup — all fields already present, no update

    expect(await ensureStoreDefinition(asExecutor(execute))).toBe('updated');
  });

  it('returns unchanged when the existing definition is already configured', async () => {
    const configured = present({
      onlineStore: { enabled: true },
      renderable: { enabled: true, data: { metaTitleKey: 'name', metaDescriptionKey: 'description' } },
    });
    const execute = vi.fn().mockResolvedValue(configured);
    expect(await ensureStoreDefinition(asExecutor(execute))).toBe('unchanged');
  });

  it('throws on create userErrors', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ data: { metaobjectDefinitionByType: null } })
      .mockResolvedValueOnce({ data: { metaobjectDefinitionCreate: { metaobjectDefinition: null, userErrors: [{ message: 'bad' }] } } });
    await expect(ensureStoreDefinition(asExecutor(execute))).rejects.toThrow(/Creating the store metaobject definition failed/);
  });
});

describe('ensureStoreFields', () => {
  const lookup = (keys: string[]) => ({
    data: { metaobjectDefinitionByType: { id: 'gid://def', fieldDefinitions: keys.map((key) => ({ key })), capabilities: {} } },
  });

  it('creates the fields missing from an existing definition and returns true', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(lookup(['store_id', 'name'])) // only two fields exist yet
      .mockResolvedValueOnce({ data: { metaobjectDefinitionUpdate: { metaobjectDefinition: { id: 'gid://def' }, userErrors: [] } } });

    expect(await ensureStoreFields(asExecutor(execute))).toBe(true);
    const ops = execute.mock.calls[1]![1]!.definition.fieldDefinitions as Array<{ create: { key: string; type: string } }>;
    const created = ops.map((o) => o.create.key);
    expect(created).toEqual(expect.arrayContaining(['tags', 'types', 'hours', 'phone']));
    expect(created).not.toContain('store_id'); // already present, not recreated
    expect(ops.find((o) => o.create.key === 'tags')!.create.type).toBe('list.single_line_text_field');
  });

  it('is idempotent: returns false and does not update when every field exists', async () => {
    const execute = vi.fn().mockResolvedValue(lookup(STORE_FIELD_DEFINITIONS.map((f) => f.key)));
    expect(await ensureStoreFields(asExecutor(execute))).toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('throws when the definition does not exist', async () => {
    const execute = vi.fn().mockResolvedValue({ data: { metaobjectDefinitionByType: null } });
    await expect(ensureStoreFields(asExecutor(execute))).rejects.toThrow(/No metaobject definition/);
  });

  it('throws on update userErrors', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(lookup(['store_id']))
      .mockResolvedValueOnce({ data: { metaobjectDefinitionUpdate: { metaobjectDefinition: null, userErrors: [{ message: 'nope' }] } } });
    await expect(ensureStoreFields(asExecutor(execute))).rejects.toThrow(/Adding store metaobject fields failed/);
  });
});

describe('listStoreNearbyTimestamps', () => {
  it('paginates and maps handle → nearby.updated_at (null when missing/unparseable)', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          metaobjects: {
            pageInfo: { hasNextPage: true, endCursor: 'c1' },
            nodes: [
              { handle: 's1', field: { value: '{"updated_at":"2026-08-01T00:00:00Z","groups":[]}' } },
              { handle: 's2', field: null },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          metaobjects: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [{ handle: 's3', field: { value: 'not-json' } }],
          },
        },
      });

    const map = await listStoreNearbyTimestamps(asExecutor(execute), {});

    expect(execute).toHaveBeenCalledTimes(2);
    expect(map.get('s1')).toBe('2026-08-01T00:00:00Z');
    expect(map.get('s2')).toBeNull(); // never enriched
    expect(map.get('s3')).toBeNull(); // unparseable → null
    expect(execute.mock.calls[1]![1]).toEqual({ type: 'store', key: 'nearby', after: 'c1' }); // second page uses the cursor
  });
});

describe('listStoreAdminPresence', () => {
  it('paginates and collects handles whose region is non-empty', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          metaobjects: {
            pageInfo: { hasNextPage: true, endCursor: 'c1' },
            nodes: [
              { handle: 's1', field: { value: 'Nouvelle-Aquitaine' } },
              { handle: 's2', field: null }, // never enriched
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          metaobjects: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              { handle: 's3', field: { value: '   ' } }, // whitespace only → not present
              { handle: 's4', field: { value: 'Kent' } },
            ],
          },
        },
      });

    const present = await listStoreAdminPresence(asExecutor(execute), {});

    expect(execute).toHaveBeenCalledTimes(2);
    expect(present.has('s1')).toBe(true);
    expect(present.has('s2')).toBe(false);
    expect(present.has('s3')).toBe(false);
    expect(present.has('s4')).toBe(true);
    expect(execute.mock.calls[1]![1]).toEqual({ type: 'store', key: 'region', after: 'c1' }); // second page uses the cursor
  });
});

describe('createFetchExecutor', () => {
  it('POSTs to the Admin GraphQL endpoint with the access token header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { ok: true } }),
    });
    const execute = createFetchExecutor({
      shop: 'demo.myshopify.com',
      accessToken: 'shpat_x',
      apiVersion: '2026-07',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const res = await execute('query { x }', { a: 1 });

    expect(res).toEqual({ data: { ok: true } });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://demo.myshopify.com/admin/api/2026-07/graphql.json');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Shopify-Access-Token']).toBe('shpat_x');
    expect(JSON.parse(init.body)).toEqual({ query: 'query { x }', variables: { a: 1 } });
  });

  it('throws AdminGraphQLError on a non-2xx HTTP response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });
    const execute = createFetchExecutor({
      shop: 's',
      accessToken: 't',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(execute('q')).rejects.toBeInstanceOf(AdminGraphQLError);
  });

  it('throws when neither an injected nor a global fetch is available', () => {
    const originalFetch = globalThis.fetch;
    // @ts-expect-error deliberately removing fetch for the test
    globalThis.fetch = undefined;
    try {
      expect(() => createFetchExecutor({ shop: 's', accessToken: 't' })).toThrow(/No global fetch/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  const noSleep = (async () => {}) as (ms: number) => Promise<void>;

  it('retries on HTTP 429, then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ status: 429, ok: false, headers: { get: () => null } })
      .mockResolvedValueOnce({ status: 200, ok: true, json: async () => ({ data: { ok: true } }) });
    const sleep = vi.fn().mockResolvedValue(undefined) as unknown as (ms: number) => Promise<void>;
    const execute = createFetchExecutor({
      shop: 's',
      accessToken: 't',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: sleep,
    });

    expect(await execute('q')).toEqual({ data: { ok: true } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('retries on a THROTTLED GraphQL error, pacing off cost.throttleStatus', async () => {
    const throttled = {
      status: 200,
      ok: true,
      json: async () => ({
        errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }],
        extensions: { cost: { requestedQueryCost: 100, throttleStatus: { maximumAvailable: 1000, currentlyAvailable: 40, restoreRate: 100 } } },
      }),
    };
    const ok = { status: 200, ok: true, json: async () => ({ data: { ok: true } }) };
    const fetchImpl = vi.fn().mockResolvedValueOnce(throttled).mockResolvedValueOnce(ok);
    const sleep = vi.fn().mockResolvedValue(undefined) as unknown as (ms: number) => Promise<void>;
    const execute = createFetchExecutor({
      shop: 's',
      accessToken: 't',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: sleep,
    });

    expect(await execute('q')).toEqual({ data: { ok: true } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // deficit (100-40)/restoreRate 100 = 0.6s → 600ms + 200ms headroom
    expect(sleep).toHaveBeenCalledWith(800);
  });

  it('gives up after maxThrottleRetries on persistent 429', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 429, ok: false, headers: { get: () => null } });
    const execute = createFetchExecutor({
      shop: 's',
      accessToken: 't',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: noSleep,
      maxThrottleRetries: 2,
    });

    await expect(execute('q')).rejects.toThrow(/throttled \(HTTP 429\) after 2 retries/i);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // attempts 0, 1, then 2 → throw
  });
});
