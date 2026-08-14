import type { AdminAreas } from './types';

/**
 * Administrative breadcrumb: country → region → county → city, values only,
 * dropping blanks and consecutive duplicates — Paris resolves county and city
 * alike, Luxembourg three levels alike, and a naive join would render
 * "Luxembourg › Luxembourg › Luxembourg". Only *consecutive* repeats are dropped.
 *
 * The store itself is not in the trail; it is the current page.
 */
export function buildBreadcrumb(admin: AdminAreas | null | undefined): string[] {
  if (!admin) {
    return [];
  }

  const trail: string[] = [];
  for (const value of [admin.country, admin.region, admin.county, admin.city]) {
    const label = value?.trim();
    if (!label) {
      continue;
    }
    if (trail[trail.length - 1] === label) {
      continue;
    }
    trail.push(label);
  }
  return trail;
}
