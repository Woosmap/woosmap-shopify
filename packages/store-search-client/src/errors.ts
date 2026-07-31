/**
 * Errors are surfaced, never swallowed. This is a deliberate departure from the
 * maps-js `StoresService`, whose `handleServiceError` logs and resolves — fine
 * for a UI widget, wrong for a sync job that must fail loudly and be retried.
 */

/** Thrown when the Woosmap API responds with a non-2xx status. */
export class WoosmapApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: unknown;
  readonly context: string;

  constructor(context: string, status: number, statusText: string, body: unknown) {
    super(`${context} failed: ${status} ${statusText}`);
    this.name = 'WoosmapApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
    this.context = context;
  }
}

/** Thrown when a request is missing a required parameter, before any network call. */
export class WoosmapRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WoosmapRequestError';
  }
}
