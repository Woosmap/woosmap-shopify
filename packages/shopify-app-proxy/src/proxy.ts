import {
  LocalitiesClient,
  mapDetailsToFormattedAddress,
  predictionToSuggestion,
} from '@woosmap/localities-client';
import type {
  ShopifyFormattedAddress,
  ShopifySuggestion,
} from '@woosmap/localities-client';

/** Query for a suggest (autocomplete) request. */
export interface AutocompleteQuery {
  query: string;
  country?: string;
  language?: string;
}

/** Query for a format-suggestion (details) request. */
export interface DetailsQuery {
  id: string;
  country?: string;
  language?: string;
}

/** Response shape Shopify's `suggest` target expects. */
export interface SuggestResult {
  suggestions: ShopifySuggestion[];
}

/** Response shape Shopify's `format-suggestion` target expects. */
export interface FormatResult {
  formattedAddress: ShopifyFormattedAddress;
}

/**
 * Turns Woosmap Localities calls into the shapes Shopify's address-autocomplete
 * targets expect. Provider logic (the key, base URL, transport) lives entirely
 * in the injected {@link LocalitiesClient}; this class holds no secret.
 *
 * `suggest` uses the free autocomplete endpoint (no per-suggestion details);
 * `format` resolves a single selected suggestion with one billed details call.
 */
export class LocalitiesProxy {
  readonly #client: LocalitiesClient;

  constructor(client: LocalitiesClient) {
    this.#client = client;
  }

  /** Autocomplete predictions for a partial address (no details calls). */
  async suggest(request: AutocompleteQuery, signal?: AbortSignal): Promise<SuggestResult> {
    const input = request.query?.trim();
    if (!input) {
      return { suggestions: [] };
    }
    const response = await this.#client.autocomplete(
      {
        input,
        types: ['address'],
        ...(request.country ? { components: { country: request.country } } : {}),
        ...(request.language ? { language: request.language } : {}),
      },
      { signal },
    );
    return { suggestions: response.localities.map(predictionToSuggestion) };
  }

  /** Resolve one selected suggestion to a Shopify-shaped formatted address. */
  async format(request: DetailsQuery, signal?: AbortSignal): Promise<FormatResult> {
    if (!request.id) {
      throw new Error('A suggestion `id` is required to resolve address details.');
    }
    const response = await this.#client.getDetails(
      {
        publicId: request.id,
        ...(request.language ? { language: request.language } : {}),
      },
      { signal },
    );
    return {
      formattedAddress: mapDetailsToFormattedAddress(
        response.result,
        request.country ? { country: request.country } : {},
      ),
    };
  }
}
