import { describe, it, expect } from 'vitest';
import { StoreSearchClient } from '@woosmap/store-search-client';
import { createStoreClient } from './woosmap.server';

describe('createStoreClient', () => {
  it('throws when WOOSMAP_PRIVATE_KEY is absent', () => {
    expect(() => createStoreClient({})).toThrow(/WOOSMAP_PRIVATE_KEY/);
  });

  it('builds a StoreSearchClient from the private key', () => {
    expect(createStoreClient({ WOOSMAP_PRIVATE_KEY: 'woos-private' })).toBeInstanceOf(StoreSearchClient);
  });

  it('accepts an optional base URL override without throwing', () => {
    expect(
      createStoreClient({ WOOSMAP_PRIVATE_KEY: 'woos-private', WOOSMAP_BASE_URL: 'https://proxy.example' }),
    ).toBeInstanceOf(StoreSearchClient);
  });
});
