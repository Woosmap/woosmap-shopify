import { describe, it, expect } from 'vitest';
import { computeAppProxySignature, verifyAppProxySignature } from '../src/signature';

const SECRET = 'shpss_test_secret';
const baseParams = {
  shop: 'demo.myshopify.com',
  path_prefix: '/apps/woosmap',
  query: '20 rue de la',
  timestamp: '1700000000',
};

describe('App Proxy signature', () => {
  it('verifies a correctly signed request', async () => {
    const signature = await computeAppProxySignature(baseParams, SECRET);
    expect(await verifyAppProxySignature({ ...baseParams, signature }, SECRET)).toBe(true);
  });

  it('rejects a wrong secret', async () => {
    const signature = await computeAppProxySignature(baseParams, SECRET);
    expect(await verifyAppProxySignature({ ...baseParams, signature }, 'other_secret')).toBe(false);
  });

  it('rejects a tampered parameter', async () => {
    const signature = await computeAppProxySignature(baseParams, SECRET);
    expect(
      await verifyAppProxySignature({ ...baseParams, query: 'tampered', signature }, SECRET),
    ).toBe(false);
  });

  it('rejects a missing signature', async () => {
    expect(await verifyAppProxySignature(baseParams, SECRET)).toBe(false);
  });

  it('handles array-valued params deterministically', async () => {
    const params = { ...baseParams, ids: ['a', 'b'] };
    const signature = await computeAppProxySignature(params, SECRET);
    expect(await verifyAppProxySignature({ ...params, signature }, SECRET)).toBe(true);
  });

  it('rejects a signature of the wrong length (no crash on mismatch)', async () => {
    expect(await verifyAppProxySignature({ ...baseParams, signature: 'deadbeef' }, SECRET)).toBe(false);
  });

  it('uses the first value when the signature param is repeated', async () => {
    const signature = await computeAppProxySignature(baseParams, SECRET);
    expect(await verifyAppProxySignature({ ...baseParams, signature: [signature, 'ignored'] }, SECRET)).toBe(true);
  });

  it('treats undefined-valued params as empty consistently', async () => {
    const params = { ...baseParams, note: undefined };
    const signature = await computeAppProxySignature(params, SECRET);
    expect(await verifyAppProxySignature({ ...params, signature }, SECRET)).toBe(true);
  });
});
