import type {
  AddressAutocompleteFormatSuggestionApi,
  AddressAutocompleteFormatSuggestionOutput,
  AddressAutocompleteStandardApi,
} from '@shopify/ui-extensions/checkout';
import { format, localitiesClient } from './woosmap';

type FormatApi = AddressAutocompleteStandardApi<'purchase.address-autocomplete.format-suggestion'> &
  AddressAutocompleteFormatSuggestionApi;

/**
 * `purchase.address-autocomplete.format-suggestion` — resolves the selected
 * suggestion into the address form fields (the only billed Woosmap details call).
 * Calls Woosmap directly with the merchant's public key from checkout settings.
 */
export default async function extension(): Promise<AddressAutocompleteFormatSuggestionOutput> {
  const api = shopify as unknown as FormatApi;
  const id = api.target.selectedSuggestion.id;
  const client = localitiesClient(api.settings as unknown as Record<string, unknown>);
  if (!id || !client) {
    return { formattedAddress: {} };
  }

  try {
    // The shared mapper types countryCode as a plain string; Shopify's output wants
    // its stricter CountryCode enum. The runtime value is a valid ISO code — adapt here.
    const formattedAddress = await format(client, id, api.localization.language.isoCode);
    return {
      formattedAddress: formattedAddress as AddressAutocompleteFormatSuggestionOutput['formattedAddress'],
    };
  } catch {
    // Never block checkout on a details failure.
    return { formattedAddress: {} };
  }
}
