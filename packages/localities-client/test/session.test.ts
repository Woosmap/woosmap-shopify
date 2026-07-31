import { describe, it, expect, vi, afterEach } from 'vitest';
import { SessionManager, defaultSessionIdFactory } from '../src/session';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SessionManager', () => {
  it('keeps the same id until reset', () => {
    let n = 0;
    const session = new SessionManager(() => `id-${n++}`);
    expect(session.id).toBe('id-0');
    expect(session.id).toBe('id-0');
  });

  it('produces a fresh id on reset', () => {
    let n = 0;
    const session = new SessionManager(() => `id-${n++}`);
    expect(session.id).toBe('id-0');
    session.reset();
    expect(session.id).toBe('id-1');
  });
});

describe('defaultSessionIdFactory', () => {
  it('returns a UUID string', () => {
    expect(defaultSessionIdFactory()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('throws a clear error when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => defaultSessionIdFactory()).toThrow(/crypto\.randomUUID/);
  });
});
