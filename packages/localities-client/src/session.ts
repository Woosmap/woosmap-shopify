/**
 * Session id management, ported from Maps JS `LocalitiesService`.
 *
 * The SDK generates one UUID at construction, sends it as `session_id` on every
 * autocomplete request AND the following details request, then resets it after a
 * successful details (and whenever the input is cleared). This groups a burst of
 * keystrokes + the resolution into one logical session for "more accurate and
 * performant results".
 */

/** Factory producing a fresh session id. */
export type SessionIdFactory = () => string;

/**
 * Default factory using the platform crypto.
 * Reads `globalThis.crypto` (worker-safe) rather than `window.crypto`, so it
 * works inside the Shopify Checkout UI Extension sandbox.
 */
export const defaultSessionIdFactory: SessionIdFactory = () => {
  const platformCrypto = globalThis.crypto;
  if (!platformCrypto || typeof platformCrypto.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID unavailable; provide a `sessionIdFactory`.');
  }
  return platformCrypto.randomUUID();
};

/** Holds the current session id and regenerates it on {@link SessionManager.reset}. */
export class SessionManager {
  #id: string;
  readonly #factory: SessionIdFactory;

  constructor(factory: SessionIdFactory = defaultSessionIdFactory) {
    this.#factory = factory;
    this.#id = factory();
  }

  /** The current session id. */
  get id(): string {
    return this.#id;
  }

  /** Start a new session. */
  reset(): void {
    this.#id = this.#factory();
  }
}
