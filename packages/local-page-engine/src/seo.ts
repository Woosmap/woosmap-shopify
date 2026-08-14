import type { Store } from '@woosmap/store-search-client';
import type { AdminAreas, PageSeo, SeoTemplates } from './types';

/**
 * Default SEO copy — the one part of the model that is not a lift from Liquid. On
 * Shopify the title and description come from the `renderable` capability, so
 * nothing generated them; a feed consumer has no such capability.
 *
 * Placeholders: `{name}` `{brand}` `{address}` `{zip}` `{city}` `{county}`
 * `{region}` `{country}`.
 */
export const DEFAULT_SEO_TEMPLATES: SeoTemplates = {
  title: '{name} — {city} | {brand}',
  description:
    '{name}, {address}, {zip} {city}. Opening hours, phone number, directions and nearby transport.',
  imageAlt: 'Map showing the location of {name}',
};

/** Separators a template may use between optional fragments. */
const SEPARATORS = '—|·,';

/**
 * Substitute placeholders, then repair the punctuation. Templates are written for
 * the best case, but real stores have holes and substituting blindly leaves debris
 * (a trailing " | ", a doubled " — , "). Repairing it is what lets one template
 * serve a whole network.
 */
export function applyTemplate(template: string, values: Record<string, string>): string {
  const substituted = template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? '');
  const sep = `[${SEPARATORS}]`;

  return (
    substituted
      .replace(/\s+/g, ' ')
      // A run of separators left by empty values collapses to the first of them.
      .replace(new RegExp(`\\s*(${sep})(?:\\s*${sep})+\\s*`, 'g'), ' $1 ')
      // A separator immediately before sentence punctuation is debris; the stop wins.
      .replace(new RegExp(`\\s*${sep}\\s*([.!?])`, 'g'), '$1')
      .replace(/\s+([.!?])/g, '$1')
      .replace(new RegExp(`^[\\s${SEPARATORS}]+`), '')
      .replace(new RegExp(`[\\s${SEPARATORS}]+$`), '')
      .trim()
  );
}

/** The placeholder values available to the SEO templates for one store. */
export function seoValues(
  store: Store,
  admin: AdminAreas | null | undefined,
  brand: string | undefined,
): Record<string, string> {
  return {
    name: store.name,
    brand: brand ?? '',
    address: store.address1,
    zip: store.zip,
    city: store.city || admin?.city || '',
    county: admin?.county ?? '',
    region: admin?.region ?? '',
    country: admin?.country ?? '',
  };
}

/** Build the SEO block for one store page. */
export function buildSeo(
  store: Store,
  admin: AdminAreas | null | undefined,
  path: string,
  brand: string | undefined,
  overrides: Partial<SeoTemplates> = {},
): PageSeo {
  const templates = { ...DEFAULT_SEO_TEMPLATES, ...overrides };
  const values = seoValues(store, admin, brand);

  return {
    title: applyTemplate(templates.title, values),
    description: applyTemplate(templates.description, values),
    canonicalPath: path,
    imageAlt: applyTemplate(templates.imageAlt, values),
  };
}
