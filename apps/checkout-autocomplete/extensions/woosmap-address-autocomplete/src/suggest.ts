import type {
  AddressAutocompleteStandardApi,
  AddressAutocompleteSuggestApi,
  AddressAutocompleteSuggestOutput,
} from '@shopify/ui-extensions/checkout';
import { callBackend } from './backend';

type SuggestApi = AddressAutocompleteStandardApi<'purchase.address-autocomplete.suggest'> &
  AddressAutocompleteSuggestApi;

/**
 * `purchase.address-autocomplete.suggest` — returns predictions as the buyer
 * types. No formatted address here (that would cost one Woosmap details call
 * per suggestion); the selected one is resolved by the format-suggestion target.
 *
 * In @shopify/ui-extensions 2026.x the run function takes NO argument: the API
 * is exposed on the global `shopify` object (typed here as `SuggestApi`).
 */
export default async function extension(): Promise<AddressAutocompleteSuggestOutput> {
  const api = shopify as unknown as SuggestApi;
  const { target, signal, localization } = api;
  const query = target.value?.trim();
  if (!query) {
    return { suggestions: [] };
  }

  const data = await callBackend<AddressAutocompleteSuggestOutput>(
    api,
    'localities/autocomplete',
    { query, country: target.selectedCountryCode, language: localization.language.isoCode },
    signal,
  );
  return { suggestions: data?.suggestions ?? [] };
}
