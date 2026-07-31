// Direct (backend-less) Woosmap access for the checkout targets.
//
// The extension calls the Woosmap Localities API straight from the checkout
// sandbox using the merchant's PUBLIC key (read from the checkout-editor
// settings). No app proxy, no server, no stored secret. The `LocalitiesClient`
// is worker-safe and defaults its baseUrl to the public Woosmap API.
//
// Shares the SAME request/mapping library as the backend variant
// (`@woosmap/localities-client`, via workspace:*) — no duplication.
import {
  LocalitiesClient,
  mapDetailsToFormattedAddress,
  predictionToSuggestion,
} from '@woosmap/localities-client';
import type {
  ShopifyFormattedAddress,
  ShopifySuggestion,
} from '@woosmap/localities-client';

/** Reads a checkout-editor setting as a trimmed non-empty string, or undefined. */
function readSetting(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Builds a Localities client from the merchant's checkout-editor settings.
 * Returns null when no public key is configured (the targets then no-op).
 */
export function localitiesClient(settings: Record<string, unknown> | undefined): LocalitiesClient | null {
  const key = readSetting(settings?.['woosmap_public_key']);
  if (!key) {
    return null;
  }
  return new LocalitiesClient({ key, defaultLanguage: readSetting(settings?.['default_language']) });
}

/** Autocomplete predictions for a partial address (no billed details calls). */
export async function suggest(
  client: LocalitiesClient,
  input: string,
  country: string | undefined,
  language: string | undefined,
  signal: AbortSignal,
): Promise<ShopifySuggestion[]> {
  const response = await client.autocomplete(
    {
      input,
      types: ['address'],
      ...(country ? { components: { country } } : {}),
      ...(language ? { language } : {}),
    },
    { signal },
  );
  return response.localities.map(predictionToSuggestion);
}

/** Resolve one selected suggestion to Shopify's formatted-address shape (one billed call). */
export async function format(
  client: LocalitiesClient,
  id: string,
  language: string | undefined,
): Promise<ShopifyFormattedAddress> {
  const response = await client.getDetails({
    publicId: id,
    ...(language ? { language } : {}),
  });
  return mapDetailsToFormattedAddress(response.result);
}
