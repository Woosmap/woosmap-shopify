import type { StoreFeature, StoreOpeningHoursPeriod, StoreProperties } from './types';

/**
 * A flat, consumer-facing store — the GeoJSON feature (nested `properties` +
 * `geometry`, snake_case, coordinates as `[lng, lat]`) collapsed into one plain
 * object with the handful of fields a Shopify store page or a custom locator
 * actually renders. This is the `Store` the rest of the workspace imports;
 * {@link ./types.StoreProperties} stays as the raw wire type.
 */
export interface Store {
  storeId: string;
  name: string;
  /** Latitude from `geometry.coordinates[1]`, or `null` when absent. */
  lat: number | null;
  /** Longitude from `geometry.coordinates[0]`, or `null` when absent. */
  lng: number | null;
  /** First address line. */
  address1: string;
  /** Remaining address lines joined with `", "` (usually empty). */
  address2: string;
  city: string;
  zip: string;
  /** ISO 3166-1 country code, upper-cased (the API returns it lower-case). */
  countryCode: string;
  phone: string;
  email: string;
  website: string;
  /** Normalised weekly opening hours, or `null` when the store has none. */
  openingHours: NormalizedOpeningHours | null;
  types: string[];
  tags: string[];
  /** ISO 8601 last-modified timestamp, used for incremental sync. */
  lastUpdated: string | null;
  /** Raw merchant data, passed through untouched. */
  userProperties: unknown;
}

/** A single opening slice, `HH:mm`–`HH:mm`. */
export interface OpeningPeriod {
  start: string;
  end: string;
}

/**
 * Weekly opening hours flattened to a stable, template-friendly shape:
 * one array of periods per weekday (`"1"` = Monday … `"7"` = Sunday), plus the
 * store timezone. Empty arrays mean "closed that day".
 */
export interface NormalizedOpeningHours {
  timezone: string;
  days: Record<WeekdayKey, OpeningPeriod[]>;
}

export type WeekdayKey = '1' | '2' | '3' | '4' | '5' | '6' | '7';
const WEEKDAY_KEYS: WeekdayKey[] = ['1', '2', '3', '4', '5', '6', '7'];

/** Flatten a Woosmap store GeoJSON feature into the flat {@link Store}. */
export function featureToStore(feature: StoreFeature): Store {
  const p: StoreProperties = feature.properties;
  const [lng, lat] = feature.geometry?.coordinates ?? [undefined, undefined];
  const lines = p.address?.lines ?? [];

  return {
    storeId: p.store_id,
    name: p.name ?? '',
    lat: typeof lat === 'number' ? lat : null,
    lng: typeof lng === 'number' ? lng : null,
    address1: lines[0] ?? '',
    address2: lines.slice(1).join(', '),
    city: p.address?.city ?? '',
    zip: p.address?.zipcode ?? '',
    countryCode: (p.address?.country_code ?? '').toUpperCase(),
    phone: p.contact?.phone ?? '',
    email: p.contact?.email ?? '',
    website: p.contact?.website ?? '',
    openingHours: normalizeOpeningHours(feature.properties),
    types: p.types ?? [],
    tags: p.tags ?? [],
    lastUpdated: p.last_updated ?? null,
    userProperties: p.user_properties ?? null,
  };
}

/**
 * Normalise opening hours, preferring the computed `weekly_opening` (which
 * folds in special/holiday overrides) and falling back to the declared
 * `opening_hours.usual`. Returns `null` when neither carries any hours.
 */
function normalizeOpeningHours(p: StoreProperties): NormalizedOpeningHours | null {
  const weekly = p.weekly_opening;
  const usual = p.opening_hours?.usual;
  const timezone = weekly?.timezone ?? p.opening_hours?.timezone ?? '';

  const days = {} as Record<WeekdayKey, OpeningPeriod[]>;
  let hasAny = false;

  for (const key of WEEKDAY_KEYS) {
    const fromWeekly = weekly?.[key]?.hours;
    const periods = fromWeekly ?? usual?.[key] ?? [];
    days[key] = periods.map(toOpeningPeriod);
    if (days[key].length > 0) {
      hasAny = true;
    }
  }

  if (!hasAny && !timezone) {
    return null;
  }
  return { timezone, days };
}

function toOpeningPeriod(period: StoreOpeningHoursPeriod): OpeningPeriod {
  return { start: period.start, end: period.end };
}
