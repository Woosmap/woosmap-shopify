// Admin GraphQL wrapper for the store metaobjects. Framework-agnostic: it takes
// an injected `GraphQLExecutor`, so the same code runs under the Shopify Remix
// `admin.graphql` context and under a standalone cron (see createFetchExecutor).
// Kept free of any transport global so it is unit-testable with a fake executor.
import {
  STORE_FIELD_DEFINITIONS,
  STORE_METAOBJECT_TYPE,
  type MetaobjectFieldInput,
} from '@woosmap/store-search-client';

/**
 * The default metaobject type — a **merchant-owned** `store` definition (no `$app:`
 * prefix), so any Admin API token with `write_metaobjects` can read, upsert, and
 * publish it, and `write_metaobject_definitions` can create/configure it. (An
 * app-owned `$app:store` type is namespaced to the owning app and is unusable from a
 * standalone cron's token — it returns `UNDEFINED_OBJECT_TYPE`.) Override via the
 * `type` option / `STORE_METAOBJECT_TYPE` env when the definition uses another type.
 */
export const DEFAULT_STORE_METAOBJECT_TYPE = STORE_METAOBJECT_TYPE;

/** A GraphQL userError as returned by Admin mutations. */
export interface GraphQLUserError {
  field?: string[] | null;
  message: string;
  code?: string | null;
}

/** The `{ data, errors }` envelope of a GraphQL response. */
export interface GraphQLResult<T> {
  data?: T | null;
  errors?: Array<{ message: string }> | null;
}

/** Executes a GraphQL operation and resolves the raw `{ data, errors }` envelope. */
export type GraphQLExecutor = <T>(
  query: string,
  variables?: Record<string, unknown>,
) => Promise<GraphQLResult<T>>;

/** Raised when a GraphQL call returns transport errors or mutation userErrors. */
export class AdminGraphQLError extends Error {
  readonly userErrors: GraphQLUserError[];
  readonly graphqlErrors: Array<{ message: string }>;

  constructor(
    message: string,
    userErrors: GraphQLUserError[] = [],
    graphqlErrors: Array<{ message: string }> = [],
  ) {
    super(message);
    this.name = 'AdminGraphQLError';
    this.userErrors = userErrors;
    this.graphqlErrors = graphqlErrors;
  }
}

const UPSERT_MUTATION = /* GraphQL */ `
  mutation UpsertStore($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject { id handle type }
      userErrors { field message code }
    }
  }
`;

interface UpsertData {
  metaobjectUpsert: {
    metaobject: { id: string; handle: string; type: string } | null;
    userErrors: GraphQLUserError[];
  };
}

/** Publishable status of a store page: `ACTIVE` = live, `DRAFT` = staged/hidden. */
export type PublishableStatus = 'ACTIVE' | 'DRAFT';

/** Input for {@link upsertStoreMetaobject}. */
export interface UpsertStoreInput {
  /** Metaobject type (defaults to {@link DEFAULT_STORE_METAOBJECT_TYPE}). */
  type?: string;
  /** Stable handle → makes the upsert idempotent (one metaobject per store). */
  handle: string;
  fields: MetaobjectFieldInput[];
  /**
   * Publishable status to set. Defaults to `ACTIVE` so synced pages go live (the
   * whole point of store pages). Pass `'DRAFT'` to stage them, or `null` to leave
   * the current status untouched.
   */
  status?: PublishableStatus | null;
}

/**
 * Upsert one store metaobject by handle. Idempotent: the same handle updates the
 * same record, and `metaobjectUpsert` leaves unspecified fields untouched. Publishes
 * the entry (`ACTIVE`) by default — without this the sync would leave pages as DRAFT
 * (invisible on the storefront).
 */
export async function upsertStoreMetaobject(
  execute: GraphQLExecutor,
  input: UpsertStoreInput,
): Promise<{ id: string; handle: string }> {
  const type = input.type ?? DEFAULT_STORE_METAOBJECT_TYPE;
  const status = input.status === undefined ? 'ACTIVE' : input.status;
  const metaobjectInput = status
    ? { fields: input.fields, capabilities: { publishable: { status } } }
    : { fields: input.fields };
  const result = await execute<UpsertData>(UPSERT_MUTATION, {
    handle: { type, handle: input.handle },
    metaobject: metaobjectInput,
  });

  assertNoGraphQLErrors(result, 'metaobjectUpsert');
  const payload = result.data?.metaobjectUpsert;
  if (payload?.userErrors && payload.userErrors.length > 0) {
    throw new AdminGraphQLError(
      `metaobjectUpsert failed for handle "${input.handle}": ${describeUserErrors(payload.userErrors)}`,
      payload.userErrors,
    );
  }
  const metaobject = payload?.metaobject;
  if (!metaobject) {
    throw new AdminGraphQLError(`metaobjectUpsert returned no metaobject for handle "${input.handle}".`);
  }
  return { id: metaobject.id, handle: metaobject.handle };
}

const DEFINITION_BY_TYPE_QUERY = /* GraphQL */ `
  query StoreDefinition($type: String!) {
    metaobjectDefinitionByType(type: $type) {
      id
      fieldDefinitions { key }
      capabilities {
        onlineStore { enabled }
        renderable { enabled data { metaTitleKey metaDescriptionKey } }
      }
    }
  }
`;

const DEFINITION_UPDATE_MUTATION = /* GraphQL */ `
  mutation ConfigureStorePages($id: ID!, $definition: MetaobjectDefinitionUpdateInput!) {
    metaobjectDefinitionUpdate(id: $id, definition: $definition) {
      metaobjectDefinition { id capabilities { onlineStore { enabled } } }
      userErrors { field message code }
    }
  }
`;

interface RenderableData {
  metaTitleKey?: string | null;
  metaDescriptionKey?: string | null;
}

interface DefinitionByTypeData {
  metaobjectDefinitionByType: {
    id: string;
    fieldDefinitions?: Array<{ key: string }> | null;
    capabilities: {
      onlineStore?: { enabled: boolean } | null;
      renderable?: { enabled: boolean; data?: RenderableData | null } | null;
    };
  } | null;
}

interface DefinitionUpdateData {
  metaobjectDefinitionUpdate: {
    metaobjectDefinition: { id: string } | null;
    userErrors: GraphQLUserError[];
  };
}

/** Options for {@link ensureStorePageCapabilities}. */
export interface StorePageCapabilityOptions {
  type?: string;
  /** URL prefix for the rendered pages (e.g. `stores` → `/stores/<handle>`). */
  urlHandle?: string;
  /** Field key mapped to the SEO meta title. */
  metaTitleKey?: string;
  /** Field key mapped to the SEO meta description. */
  metaDescriptionKey?: string;
}

/**
 * Enable the two capabilities TOML cannot fully declare — `online_store` (theme
 * template + public URL) and the `renderable` SEO field mapping — in one update.
 * Idempotent: it reads the definition first and skips the write when both are
 * already as desired. Returns `true` when it changed something, `false` otherwise.
 */
export async function ensureStorePageCapabilities(
  execute: GraphQLExecutor,
  options: StorePageCapabilityOptions = {},
): Promise<boolean> {
  const type = options.type ?? DEFAULT_STORE_METAOBJECT_TYPE;
  const urlHandle = options.urlHandle ?? 'stores';
  const metaTitleKey = options.metaTitleKey ?? 'name';
  const metaDescriptionKey = options.metaDescriptionKey ?? 'description';

  const lookup = await execute<DefinitionByTypeData>(DEFINITION_BY_TYPE_QUERY, { type });
  assertNoGraphQLErrors(lookup, 'metaobjectDefinitionByType');

  const definition = lookup.data?.metaobjectDefinitionByType;
  if (!definition) {
    throw new AdminGraphQLError(`No metaobject definition found for type "${type}". Deploy the app config first.`);
  }

  const onlineStoreOn = definition.capabilities.onlineStore?.enabled === true;
  const seo = definition.capabilities.renderable?.data;
  const seoMapped = seo?.metaTitleKey === metaTitleKey && seo?.metaDescriptionKey === metaDescriptionKey;
  if (onlineStoreOn && seoMapped) {
    return false;
  }

  const update = await execute<DefinitionUpdateData>(DEFINITION_UPDATE_MUTATION, {
    id: definition.id,
    definition: {
      capabilities: {
        onlineStore: { enabled: true, data: { urlHandle } },
        renderable: { enabled: true, data: { metaTitleKey, metaDescriptionKey } },
      },
    },
  });
  assertNoGraphQLErrors(update, 'metaobjectDefinitionUpdate');
  const errors = update.data?.metaobjectDefinitionUpdate.userErrors ?? [];
  if (errors.length > 0) {
    throw new AdminGraphQLError(`Configuring store-page capabilities failed: ${describeUserErrors(errors)}`, errors);
  }
  return true;
}

/**
 * Ensure every field in {@link STORE_FIELD_DEFINITIONS} exists on an
 * already-created definition. Fields added to the schema later (e.g. `types`,
 * `tags`) are created on the live definition via `metaobjectDefinitionUpdate`
 * field-create operations — the create path handles a fresh definition, this
 * handles an existing one. Idempotent: it reads the current fields and only
 * creates the missing ones. Returns `true` when it added any field.
 */
export async function ensureStoreFields(
  execute: GraphQLExecutor,
  options: { type?: string } = {},
): Promise<boolean> {
  const type = options.type ?? DEFAULT_STORE_METAOBJECT_TYPE;

  const lookup = await execute<DefinitionByTypeData>(DEFINITION_BY_TYPE_QUERY, { type });
  assertNoGraphQLErrors(lookup, 'metaobjectDefinitionByType');
  const definition = lookup.data?.metaobjectDefinitionByType;
  if (!definition) {
    throw new AdminGraphQLError(`No metaobject definition found for type "${type}".`);
  }

  const existing = new Set((definition.fieldDefinitions ?? []).map((field) => field.key));
  const missing = STORE_FIELD_DEFINITIONS.filter((field) => !existing.has(field.key));
  if (missing.length === 0) {
    return false;
  }

  const update = await execute<DefinitionUpdateData>(DEFINITION_UPDATE_MUTATION, {
    id: definition.id,
    definition: {
      fieldDefinitions: missing.map((field) => ({
        create: {
          key: field.key,
          name: field.name,
          type: field.type,
          ...(field.required ? { required: true } : {}),
        },
      })),
    },
  });
  assertNoGraphQLErrors(update, 'metaobjectDefinitionUpdate');
  const errors = update.data?.metaobjectDefinitionUpdate.userErrors ?? [];
  if (errors.length > 0) {
    throw new AdminGraphQLError(`Adding store metaobject fields failed: ${describeUserErrors(errors)}`, errors);
  }
  return true;
}

const DEFINITION_CREATE_MUTATION = /* GraphQL */ `
  mutation CreateStoreDefinition($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition { id type }
      userErrors { field message code }
    }
  }
`;

interface DefinitionCreateData {
  metaobjectDefinitionCreate: {
    metaobjectDefinition: { id: string; type: string } | null;
    userErrors: GraphQLUserError[];
  };
}

/** What {@link ensureStoreDefinition} did. */
export type EnsureStoreDefinitionOutcome = 'created' | 'updated' | 'unchanged';

/**
 * Ensure the **merchant-owned** `store` metaobject definition exists and is
 * configured. When absent, it is created with the {@link STORE_FIELD_DEFINITIONS}
 * fields and the `online_store` + `renderable` SEO + `publishable` capabilities
 * (and `storefront: PUBLIC_READ` so the theme can read it). When present, its
 * capabilities are ensured via {@link ensureStorePageCapabilities}. Idempotent and
 * safe to run before every sync — this replaces the removed app-config (TOML)
 * definition, which was app-owned and unusable from a standalone token.
 */
export async function ensureStoreDefinition(
  execute: GraphQLExecutor,
  options: StorePageCapabilityOptions = {},
): Promise<EnsureStoreDefinitionOutcome> {
  const type = options.type ?? DEFAULT_STORE_METAOBJECT_TYPE;
  const urlHandle = options.urlHandle ?? 'stores';
  const metaTitleKey = options.metaTitleKey ?? 'name';
  const metaDescriptionKey = options.metaDescriptionKey ?? 'description';

  const lookup = await execute<DefinitionByTypeData>(DEFINITION_BY_TYPE_QUERY, { type });
  assertNoGraphQLErrors(lookup, 'metaobjectDefinitionByType');

  if (lookup.data?.metaobjectDefinitionByType) {
    const capsChanged = await ensureStorePageCapabilities(execute, { type, urlHandle, metaTitleKey, metaDescriptionKey });
    const fieldsChanged = await ensureStoreFields(execute, { type });
    return capsChanged || fieldsChanged ? 'updated' : 'unchanged';
  }

  const create = await execute<DefinitionCreateData>(DEFINITION_CREATE_MUTATION, {
    definition: {
      type,
      name: 'Store',
      displayNameKey: 'name',
      // A merchant-owned definition must NOT set access.admin (implicit); only
      // storefront access is settable, and PUBLIC_READ lets the theme render it.
      access: { storefront: 'PUBLIC_READ' },
      capabilities: {
        publishable: { enabled: true },
        renderable: { enabled: true, data: { metaTitleKey, metaDescriptionKey } },
        onlineStore: { enabled: true, data: { urlHandle } },
      },
      fieldDefinitions: STORE_FIELD_DEFINITIONS.map((field) => ({
        key: field.key,
        name: field.name,
        type: field.type,
        ...(field.required ? { required: true } : {}),
      })),
    },
  });
  assertNoGraphQLErrors(create, 'metaobjectDefinitionCreate');
  const createErrors = create.data?.metaobjectDefinitionCreate.userErrors ?? [];
  if (createErrors.length > 0) {
    throw new AdminGraphQLError(
      `Creating the store metaobject definition failed: ${describeUserErrors(createErrors)}`,
      createErrors,
    );
  }
  return 'created';
}

const STORE_FIELD_PAGE_QUERY = /* GraphQL */ `
  query StoreFieldPage($type: String!, $key: String!, $after: String) {
    metaobjects(type: $type, first: 250, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { handle field(key: $key) { value } }
    }
  }
`;

interface FieldPageData {
  metaobjects: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{ handle: string; field: { value: string | null } | null }>;
  };
}

/** Paginate every store metaobject, calling `onNode` with each handle + one field's value. */
async function forEachStoreField(
  execute: GraphQLExecutor,
  type: string,
  key: string,
  onNode: (handle: string, value: string | null) => void,
): Promise<void> {
  let after: string | null = null;
  do {
    const page: GraphQLResult<FieldPageData> = await execute<FieldPageData>(STORE_FIELD_PAGE_QUERY, { type, key, after });
    assertNoGraphQLErrors(page, 'metaobjects');
    const conn = page.data?.metaobjects;
    if (!conn) break;
    for (const node of conn.nodes) {
      onNode(node.handle, node.field?.value ?? null);
    }
    after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (after);
}

/**
 * Bulk-read the `nearby.updated_at` timestamp of every store metaobject, so the
 * sync can decide TTL freshness once (not per store). Returns `handle → ISO
 * timestamp` (or `null` when never enriched / unparseable).
 */
export async function listStoreNearbyTimestamps(
  execute: GraphQLExecutor,
  options: { type?: string } = {},
): Promise<Map<string, string | null>> {
  const type = options.type ?? DEFAULT_STORE_METAOBJECT_TYPE;
  const map = new Map<string, string | null>();
  await forEachStoreField(execute, type, 'nearby', (handle, value) => {
    let updatedAt: string | null = null;
    if (value) {
      try {
        updatedAt = (JSON.parse(value) as { updated_at?: string }).updated_at ?? null;
      } catch {
        updatedAt = null;
      }
    }
    map.set(handle, updatedAt);
  });
  return map;
}

/**
 * Set of store handles that ALREADY carry admin data (a non-empty `region`).
 * Admin boundaries don't change, so the sync enriches only handles absent from
 * this set — new stores get filled on the next run.
 */
export async function listStoreAdminPresence(
  execute: GraphQLExecutor,
  options: { type?: string } = {},
): Promise<Set<string>> {
  const type = options.type ?? DEFAULT_STORE_METAOBJECT_TYPE;
  const present = new Set<string>();
  await forEachStoreField(execute, type, 'region', (handle, value) => {
    if ((value ?? '').trim() !== '') present.add(handle);
  });
  return present;
}

/** Options for {@link createFetchExecutor}. */
export interface FetchExecutorOptions {
  shop: string;
  accessToken: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
  /** Max retries when the Admin API throttles (HTTP 429 or a THROTTLED GraphQL error). Default 5. */
  maxThrottleRetries?: number;
  /** Async delay between throttle retries — injectable so tests don't actually wait. Default: real timer. */
  sleepImpl?: (ms: number) => Promise<void>;
}

/**
 * Build a {@link GraphQLExecutor} over `fetch` for a standalone (cron) context.
 * Throttle-aware: on an HTTP 429 or a GraphQL `THROTTLED` error it waits and retries
 * (up to `maxThrottleRetries`), pacing off the Admin API's `cost.throttleStatus` so a
 * large sync (tens of thousands of upserts) self-throttles instead of failing.
 */
export function createFetchExecutor(options: FetchExecutorOptions): GraphQLExecutor {
  const apiVersion = options.apiVersion ?? '2026-07';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('No global fetch available; pass `fetchImpl` to createFetchExecutor.');
  }
  const endpoint = `https://${options.shop}/admin/api/${apiVersion}/graphql.json`;
  const maxRetries = options.maxThrottleRetries ?? 5;
  const sleep = options.sleepImpl ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  return async <T>(query: string, variables?: Record<string, unknown>) => {
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': options.accessToken,
        },
        body: JSON.stringify({ query, variables }),
      });

      // HTTP 429: rate-limited before the query ran. Retry with backoff.
      if (response.status === 429) {
        if (attempt >= maxRetries) {
          throw new AdminGraphQLError(`Admin GraphQL throttled (HTTP 429) after ${maxRetries} retries.`);
        }
        await sleep(retryAfterMs(response, attempt));
        continue;
      }
      if (!response.ok) {
        throw new AdminGraphQLError(`Admin GraphQL HTTP ${response.status} ${response.statusText}.`);
      }

      const body = (await response.json()) as GraphQLResult<T>;

      // GraphQL-level THROTTLED: the query-cost budget was exceeded. Wait for it to
      // restore (from cost.throttleStatus) and retry, so the sync self-paces.
      if (attempt < maxRetries && isThrottledResponse(body)) {
        await sleep(throttleWaitMs(body, attempt));
        continue;
      }
      return body;
    }
  };
}

interface ThrottleCost {
  requestedQueryCost?: number;
  throttleStatus?: { maximumAvailable: number; currentlyAvailable: number; restoreRate: number };
}

/** True when a GraphQL response is a throttling error (Admin API cost budget exceeded). */
export function isThrottledResponse(body: GraphQLResult<unknown>): boolean {
  return (body.errors ?? []).some(
    (e) => (e as { extensions?: { code?: string } }).extensions?.code === 'THROTTLED' || /throttled/i.test(e.message),
  );
}

/** Milliseconds to wait before retrying a THROTTLED request, from `cost.throttleStatus` when present. */
function throttleWaitMs(body: GraphQLResult<unknown>, attempt: number): number {
  const cost = (body as { extensions?: { cost?: ThrottleCost } }).extensions?.cost;
  const status = cost?.throttleStatus;
  if (status && status.restoreRate > 0) {
    const deficit = Math.max(0, (cost?.requestedQueryCost ?? 0) - status.currentlyAvailable);
    // +200ms headroom so we clear the threshold rather than land exactly on it.
    return Math.ceil((deficit / status.restoreRate) * 1000) + 200;
  }
  return backoffMs(attempt);
}

/** Retry-After header (seconds) when a 429 carries one, else exponential backoff. */
function retryAfterMs(response: { headers?: { get(name: string): string | null } }, attempt: number): number {
  const header = response.headers?.get?.('Retry-After');
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) ? seconds * 1000 : backoffMs(attempt);
}

/** Exponential backoff capped at 10s: 500ms, 1s, 2s, 4s, 8s, 10s… */
function backoffMs(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 10_000);
}

function assertNoGraphQLErrors(result: GraphQLResult<unknown>, context: string): void {
  if (result.errors && result.errors.length > 0) {
    throw new AdminGraphQLError(
      `${context} returned GraphQL errors: ${result.errors.map((e) => e.message).join('; ')}`,
      [],
      result.errors,
    );
  }
}

function describeUserErrors(errors: GraphQLUserError[]): string {
  return errors.map((e) => `${(e.field ?? []).join('.') || '(root)'}: ${e.message}`).join('; ');
}
