/** The tightest handle limit among the adapters we know (Shopify), so one slug works everywhere. */
export const MAX_SLUG = 255;

/**
 * Page slug from a Woosmap `store_id`.
 *
 * Byte-for-byte identical to the `storeToMetaobjectHandle` it replaces, so no page
 * already published on Shopify changes URL — and it keeps the SEO it accumulated.
 * `[a-z0-9_-]` survives; any run of anything else collapses to one hyphen, ends are
 * trimmed, capped at 255.
 */
export function storeSlug(storeId: string): string {
  return storeId
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG);
}

/** Join a path prefix and a slug into a canonical path, tolerating stray slashes. */
export function canonicalPath(urlBase: string, slug: string): string {
  const base = `/${urlBase}`.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return `${base}/${slug}`;
}

/**
 * Absolute URL for a page path, or `null` when no origin is configured.
 *
 * schema.org wants absolute URLs, so a consumer with no platform to ask (a feed)
 * needs this; a Shopify theme has Liquid's `canonical_url` and can ignore it.
 */
export function canonicalUrl(origin: string | undefined, path: string): string | null {
  const trimmed = origin?.trim().replace(/\/+$/, '');
  return trimmed ? `${trimmed}${path}` : null;
}

/**
 * Latin letters that have no NFD decomposition, so stripping combining marks cannot reach
 * them. Without this table `Łódzkie` slugs as `odzkie` and `Trøndelag` as `tr-ndelag` —
 * and an area slug is a permanent URL, so a wrong one costs a redirect forever.
 *
 * Latin script only, deliberately. Turning `Αττική` into `attiki` rather than `attikí` or
 * `attike` is an editorial decision belonging to the network being set up, not a default
 * this package should pick on its behalf. Such a name yields `''`, which {@link areaSlug}'s
 * caller reports rather than guesses at.
 */
const LATIN_FOLD: Record<string, string> = {
  ł: 'l',
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
  ŋ: 'n',
  ħ: 'h',
  ŧ: 't',
  ƶ: 'z',
  ə: 'e',
  ſ: 's',
};

/**
 * Slug for one administrative area name, e.g. `greater-manchester`.
 *
 * Accents are folded here and not in {@link storeSlug}, because these are place names and
 * `Côte-d'Or` must not come out as `c-te-d-or`. `&` becomes `and`, so
 * `Bath & North East Somerset` reads. An empty result means the name cannot be addressed:
 * {@link buildAreaPages} reports it rather than dropping the rung silently.
 */
export function areaSlug(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      // After the case fold, so the table only carries lower-case keys.
      .replace(/[^\u0020-\u007e]/g, (ch) => LATIN_FOLD[ch] ?? ch)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_SLUG)
      // The cap can land mid-separator, and a handle must not end on one.
      .replace(/-+$/, '')
  );
}

/**
 * A child area's slug, carrying its parent's so two counties of the same name in
 * different regions stay apart.
 *
 * Truncation is where that guarantee broke: slicing a join whose parent already sat at the
 * cap returned the parent's own slug, so the child was looked up as — and folded into —
 * its own parent. When the join does not fit, the tail becomes a hash of the whole pair,
 * which collides only if the pair itself does.
 */
export function childSlug(parentSlug: string, own: string): string {
  const joined = `${parentSlug}-${own}`;
  if (joined.length <= MAX_SLUG) {
    return joined;
  }
  const suffix = `-${hash36(joined)}`;
  return `${joined.slice(0, MAX_SLUG - suffix.length).replace(/-+$/, '')}${suffix}`;
}

/** FNV-1a in base 36. Not cryptographic: it only has to spread truncated slugs apart. */
function hash36(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0');
}
