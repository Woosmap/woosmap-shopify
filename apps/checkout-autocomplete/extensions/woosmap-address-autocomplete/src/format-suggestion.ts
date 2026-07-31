import type {
  AddressAutocompleteFormatSuggestionApi,
  AddressAutocompleteFormatSuggestionOutput,
  AddressAutocompleteStandardApi,
} from '@shopify/ui-extensions/checkout';
import { callBackend } from './backend';

type FormatApi = AddressAutocompleteStandardApi<'purchase.address-autocomplete.format-suggestion'> &
  AddressAutocompleteFormatSuggestionApi;

/**
 * `purchase.address-autocomplete.format-suggestion` — resolves the selected
 * suggestion into the fields Shopify fills in the address form. This is the
 * only place a (billed) Woosmap details call happens.
 *
 * The country is intentionally not sent: the details response carries its own
 * country component, which the mapping uses.
 *
 * In @shopify/ui-extensions 2026.x the run function takes NO argument: the API
 * is exposed on the global `shopify` object (typed here as `FormatApi`).
 */
export default async function extension(): Promise<AddressAutocompleteFormatSuggestionOutput> {
  const api = shopify as unknown as FormatApi;
  const { target, localization } = api;
  const id = target.selectedSuggestion.id;
  if (!id) {
    return { formattedAddress: {} };
  }

  const data = await callBackend<AddressAutocompleteFormatSuggestionOutput>(
    api,
    'localities/details',
    { id, language: localization.language.isoCode },
  );
  return { formattedAddress: data?.formattedAddress ?? {} };
}
