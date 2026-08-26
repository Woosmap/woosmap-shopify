import type { AddressComponent, LocalitiesPrediction } from './types';

/**
 * Maps a Woosmap Localities `details` result onto the address shape Shopify's
 * `purchase.address-autocomplete.format-suggestion` target expects:
 * `{ address1, address2, city, zip, provinceCode, countryCode }`.
 *
 * Ported from the `bigcommerce-js` mapping (`processComponents` /
 * `filterComponentsOnType` / `cleanAddress`), retargeted to Shopify's six
 * fields and hardened: component values may be `string | string[]` (per the
 * official types), regex values are escaped, and a fallback derives the street
 * line when no street-level component is present.
 *
 * `provinceCode` / `countryCode` are emitted as ISO short codes, as Shopify
 * expects codes rather than display names.
 */

/** The address shape returned to Shopify's format-suggestion target. */
export interface ShopifyFormattedAddress {
  address1: string;
  address2: string;
  city: string;
  zip: string;
  provinceCode: string;
  countryCode: string;
}

/** A highlight span, in Shopify's `{ offset, length }` shape. */
export interface ShopifyMatchedSubstring {
  offset: number;
  length: number;
}

/** A suggestion returned to Shopify's suggest target. */
export interface ShopifySuggestion {
  id: string;
  label: string;
  matchedSubstrings: ShopifyMatchedSubstring[];
}

/** Options influencing the mapping. */
export interface MapOptions {
  /** Fallback ISO country code when the result carries no country component. */
  country?: string;
}

/**
 * The subset of a details result the mapper reads. A full official
 * `LocalitiesDetailsResult` is assignable to this, but keeping it narrow lets
 * the mapper tolerate partial data defensively.
 */
export interface MappableDetails {
  formatted_address?: string;
  address_components?: AddressComponent[];
}

/** Woosmap component types that map onto a discrete Shopify field (not the street line). */
const FIELD_TYPES = [
  'state',
  'county',
  'locality',
  'postal_code',
  'postal_codes',
  'country',
  'premise',
  'postal_town',
] as const;

/** Map a Localities details result to Shopify's `formattedAddress`. */
export function mapDetailsToFormattedAddress(
  result: MappableDetails,
  options: MapOptions = {},
): ShopifyFormattedAddress {
  const components = result.address_components ?? [];
  const country = options.country;
  const { fieldComponents, lineComponents } = partition(components, country);

  const address: ShopifyFormattedAddress = {
    address1: '',
    address2: '',
    city: '',
    zip: '',
    provinceCode: '',
    countryCode: country ?? '',
  };

  const exclude: string[] = [];
  for (const component of fieldComponents) {
    assignField(address, component, exclude);
  }

  const keep: string[] = [];
  for (const component of lineComponents) {
    keep.push(firstStr(component.long_name), firstStr(component.short_name));
  }

  const formatted = result.formatted_address ?? '';
  address.address1 = buildAddressLine(formatted, keep, exclude) || firstStreetSegment(formatted, exclude);

  return address;
}

/** Map an autocomplete prediction to a Shopify suggestion. */
export function predictionToSuggestion(prediction: LocalitiesPrediction): ShopifySuggestion {
  return {
    id: prediction.public_id,
    label: prediction.description ?? '',
    matchedSubstrings: prediction.matched_substrings?.description ?? [],
  };
}

/**
 * Split components into those that fill a discrete field and those that make up
 * the street line. Handles the London-style case where `postal_town` is the
 * real city and a `locality` is only a neighbourhood: the locality stays in the
 * street line (dropped entirely for FR, mirroring the source behaviour).
 */
function partition(
  components: AddressComponent[],
  country: string | undefined,
): { fieldComponents: AddressComponent[]; lineComponents: AddressComponent[] } {
  const hasPostalTown = components.some((c) => c.types.includes('postal_town'));
  const fieldComponents: AddressComponent[] = [];
  const lineComponents: AddressComponent[] = [];

  for (const component of components) {
    const isFieldType = component.types.some((type) => (FIELD_TYPES as readonly string[]).includes(type));
    if (!isFieldType) {
      lineComponents.push(component);
      continue;
    }
    if (hasPostalTown && component.types.includes('locality')) {
      if (country !== 'FR') {
        lineComponents.push(component);
      }
      continue;
    }
    fieldComponents.push(component);
  }

  return { fieldComponents, lineComponents };
}

/** Assign a field component to its Shopify field and record its values for exclusion from the line. */
function assignField(address: ShopifyFormattedAddress, component: AddressComponent, exclude: string[]): void {
  const longName = firstStr(component.long_name);
  const shortName = firstStr(component.short_name);

  for (const type of component.types) {
    switch (type) {
      case 'country':
        address.countryCode = shortName || address.countryCode;
        break;
      case 'state':
        // Only use the short name when it is a real code (differs from the full
        // name). Woosmap FR regions have no ISO code (short === long), and
        // Shopify FR addresses have no province — leave it blank there.
        if (shortName && shortName !== longName) {
          address.provinceCode = shortName;
        }
        break;
      case 'county':
        if (!address.provinceCode && shortName && shortName !== longName) {
          address.provinceCode = shortName;
        }
        break;
      case 'postal_code':
      case 'postal_codes':
        address.zip = longName;
        break;
      case 'locality':
        if (!address.city) {
          address.city = longName;
        }
        break;
      case 'postal_town':
        address.city = longName;
        break;
      case 'premise':
        address.address2 = longName;
        break;
      default:
        continue;
    }
    exclude.push(longName, shortName);
  }
}

/**
 * Build the street line by keeping only street-level component values as they
 * appear in `formatted_address`, after dropping segments already consumed by
 * discrete fields.
 */
function buildAddressLine(formatted: string, keep: string[], exclude: string[]): string {
  const keepValues = keep.filter((value) => value.length > 0 && !exclude.includes(value.trim()));
  if (keepValues.length === 0) {
    return '';
  }
  const filtered = formatted
    .split(', ')
    .filter((segment) => !exclude.includes(segment.trim()))
    .join(', ');

  const pattern = new RegExp(keepValues.map((value) => `(\\b|^)${escapeRegExp(value)}(,|\\b|$)`).join('|'), 'gui');
  const matches = filtered.match(pattern);
  if (!matches) {
    return '';
  }
  const joined = matches
    .map((match) => match.trim())
    .join(' ')
    .replace(/,+$/, '');
  return [...new Set(joined.split(', '))].join(', ');
}

/** Fallback: the first `formatted_address` segment not already consumed by a field. */
function firstStreetSegment(formatted: string, exclude: string[]): string {
  for (const segment of formatted.split(', ').map((s) => s.trim())) {
    if (segment.length > 0 && !exclude.includes(segment)) {
      return segment;
    }
  }
  return '';
}

/** Normalise a component value that may be a string or an array of strings. */
function firstStr(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

/** Escape a string for safe inclusion in a RegExp (the source did not — a latent bug). */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
