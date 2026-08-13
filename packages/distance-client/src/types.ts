/** A geographic point. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Travel mode for the matrix. */
export type TravelMode = 'driving' | 'walking' | 'bicycling' | 'truck';

/** Which values each element carries. `duration_distance` returns both. */
export type DistanceElementType = 'duration_distance' | 'duration' | 'distance';

/** A distance matrix request: every origin measured against every destination. */
export interface DistanceMatrixRequest {
  origins: LatLng[];
  destinations: LatLng[];
  mode?: TravelMode;
  elements?: DistanceElementType;
  language?: string;
  units?: 'metric' | 'imperial';
}

/** A distance or duration, both machine value and display text. */
export interface DistanceValueText {
  value: number;
  text: string;
}

/** One origin→destination cell. `status` is `OK` when a route exists. */
export interface DistanceMatrixElement {
  status: string;
  distance?: DistanceValueText;
  duration?: DistanceValueText;
}

/** One origin's row: an element per destination, in order. */
export interface DistanceMatrixRow {
  elements: DistanceMatrixElement[];
}

/** The matrix response: a row per origin, in order. */
export interface DistanceMatrixResponse {
  status?: string;
  rows: DistanceMatrixRow[];
}
