import type { LatLng } from './types';

/** `"lat,lng"`. */
export const encodeLatLng = (p: LatLng): string => `${p.lat},${p.lng}`;

/** `"lat,lng|lat,lng|…"`. */
export const encodeLatLngList = (points: LatLng[]): string => points.map(encodeLatLng).join('|');
