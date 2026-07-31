/**
 * Shopify App Proxy request authentication.
 *
 * Shopify signs proxied storefront requests: the params (minus `signature`) are
 * sorted, concatenated as `key=value` with array values joined by `,` and no
 * separator between pairs, then HMAC-SHA256'd with the app's client secret and
 * hex-encoded. Verifying this proves the request genuinely came from Shopify —
 * the gate that stops anyone from hitting the proxy and burning the merchant's
 * Woosmap quota.
 *
 * Uses Web Crypto (available in Node 18+ and edge runtimes) — no Node built-ins.
 */

type ProxyParams = Record<string, string | string[] | undefined>;

function normalizeValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join(',');
  }
  return value ?? '';
}

function firstScalar(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two equal-length hex strings. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Compute the App Proxy signature for a set of query params. */
export async function computeAppProxySignature(params: ProxyParams, sharedSecret: string): Promise<string> {
  const message = Object.keys(params)
    .filter((key) => key !== 'signature')
    .sort()
    .map((key) => `${key}=${normalizeValue(params[key])}`)
    .join('');
  return hmacSha256Hex(sharedSecret, message);
}

/** Verify a Shopify App Proxy request signature. Returns `false` on any mismatch. */
export async function verifyAppProxySignature(params: ProxyParams, sharedSecret: string): Promise<boolean> {
  const provided = firstScalar(params['signature']);
  if (!provided) {
    return false;
  }
  const expected = await computeAppProxySignature(params, sharedSecret);
  return timingSafeEqualHex(expected, provided);
}
