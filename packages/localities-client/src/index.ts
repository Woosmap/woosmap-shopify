export { LocalitiesClient } from './localities-client';
export type { LocalitiesClientOptions, RequestOptions } from './localities-client';
export { SessionManager, defaultSessionIdFactory } from './session';
export type { SessionIdFactory } from './session';
export { defaultTransport } from './transport';
export type { Transport, TransportInit, TransportResponse } from './transport';
export { WoosmapApiError, WoosmapRequestError } from './errors';
export { encodeComponents, encodeLatLng, encodeTypes } from './params';
export { mapDetailsToFormattedAddress, predictionToSuggestion } from './address-mapping';
export type {
  ShopifyFormattedAddress,
  ShopifySuggestion,
  ShopifyMatchedSubstring,
  MapOptions,
  MappableDetails,
} from './address-mapping';
export type * from './types';
