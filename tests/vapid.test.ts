import { describe, it, expect, afterEach } from 'vitest';
import { publicVapidKey } from '../lib/vapid';

const PREFIXED = 'NEXT_PUBLIC_VAPID_PUBLIC_KEY';
const PLAIN = 'VAPID_PUBLIC_KEY';

afterEach(() => {
  delete process.env[PLAIN];
  delete process.env[PREFIXED];
});

describe('publicVapidKey', () => {
  it('reads the unprefixed name', () => {
    process.env[PLAIN] = 'plain-key';
    expect(publicVapidKey()).toBe('plain-key');
  });

  it('falls back to the prefixed name', () => {
    // The prefixed form was the first instruction given, and Vercel refuses it
    // on a sensitive variable — a deployment should not hinge on which one got
    // typed into the dashboard.
    process.env[PREFIXED] = 'prefixed-key';
    expect(publicVapidKey()).toBe('prefixed-key');
  });

  it('prefers the unprefixed name when both are set', () => {
    process.env[PLAIN] = 'plain-key';
    process.env[PREFIXED] = 'prefixed-key';
    expect(publicVapidKey()).toBe('plain-key');
  });

  it('returns null when neither is set, so callers can skip', () => {
    expect(publicVapidKey()).toBeNull();
  });

  it('treats an empty value as absent', () => {
    // An env var set to "" in a dashboard is a mistake, not a key.
    process.env[PLAIN] = '';
    expect(publicVapidKey()).toBeNull();
  });
});
