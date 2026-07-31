// Builds the Woosmap Store client for the sync job. Server-only: it reads the
// PRIVATE key (server-to-server; a public key would 401/403 without a browser
// Referer). Never import this from anything that reaches the storefront.
import { StoreSearchClient } from '@woosmap/store-search-client';

/** Construct a {@link StoreSearchClient} from environment variables. */
export function createStoreClient(env: Record<string, string | undefined> = process.env): StoreSearchClient {
  const privateKey = env.WOOSMAP_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('WOOSMAP_PRIVATE_KEY is required to run the store sync.');
  }
  return new StoreSearchClient({
    privateKey,
    ...(env.WOOSMAP_BASE_URL ? { baseUrl: env.WOOSMAP_BASE_URL } : {}),
  });
}
