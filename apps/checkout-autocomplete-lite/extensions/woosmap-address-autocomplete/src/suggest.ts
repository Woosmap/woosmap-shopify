import type {
  AddressAutocompleteStandardApi,
  AddressAutocompleteSuggestApi,
  AddressAutocompleteSuggestOutput,
} from '@shopify/ui-extensions/checkout';
import { localitiesClient, suggest } from './woosmap';

type SuggestApi = AddressAutocompleteStandardApi<'purchase.address-autocomplete.suggest'> &
  AddressAutocompleteSuggestApi;

/**
 * `purchase.address-autocomplete.suggest` — predictions as the buyer types.
 * Calls Woosmap directly with the merchant's public key from checkout settings.
 * In @shopify/ui-extensions 2026.x the run function takes NO argument (global `shopify`).
 */
export default async function extension(): Promise<AddressAutocompleteSuggestOutput> {
  const api = shopify as unknown as SuggestApi;
  const query = api.target.value?.trim();
  const client = localitiesClient(api.settings as unknown as Record<string, unknown>);
  if (!query || !client) {
    return { suggestions: [] };
  }

  try {
    const suggestions = await suggest(
      client,
      query,
      api.target.selectedCountryCode,
      api.localization.language.isoCode,
      api.signal,
    );
    return { suggestions };
  } catch {
    // Never block checkout on an autocomplete failure.
    return { suggestions: [] };
  }
}
