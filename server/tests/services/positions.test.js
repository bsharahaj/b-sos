import { describe, it, expect, beforeEach } from 'vitest';
import { positions, shouldPersist, POSITION_TTL_MS, PERSIST_EVERY_MS } from '../../src/services/positions.js';

const telAviv = { lat: 32.08534, lng: 34.78176, accuracy: 10 };

describe('positions store', () => {
  beforeEach(() => positions.clear());

  it('returns the latest sample and forgets it after the TTL', () => {
    positions.set('u1', telAviv, 1000);
    expect(positions.get('u1', 2000)).toMatchObject({ lat: telAviv.lat, lng: telAviv.lng, at: 1000 });
    expect(positions.get('u1', 1000 + POSITION_TTL_MS + 1)).toBeNull();
    expect(positions.get('u1', 1000)).toBeNull(); // expired entries are removed
  });

  it('keeps persistence bookkeeping across samples', () => {
    positions.set('u1', telAviv, 1000);
    positions.markPersisted('u1', 1000);
    const next = positions.set('u1', { ...telAviv, lat: telAviv.lat + 0.0001 }, 4000);
    expect(next.persistedAt).toBe(1000);
    expect(next.persistedPos).toEqual({ lat: telAviv.lat, lng: telAviv.lng });
  });
});

describe('shouldPersist', () => {
  it('persists the first sample', () => {
    expect(shouldPersist({ ...telAviv, persistedAt: 0, persistedPos: null }, 1000)).toBe(true);
  });

  it('skips a sample that is recent and close to the last persisted one', () => {
    const entry = { ...telAviv, persistedAt: 1000, persistedPos: { lat: telAviv.lat, lng: telAviv.lng } };
    expect(shouldPersist(entry, 1000 + 5000)).toBe(false);
  });

  it('persists again after the interval or after moving ~50 m', () => {
    const base = { ...telAviv, persistedAt: 1000, persistedPos: { lat: telAviv.lat, lng: telAviv.lng } };
    expect(shouldPersist(base, 1000 + PERSIST_EVERY_MS)).toBe(true);
    // ~0.0006° latitude ≈ 67 m
    expect(shouldPersist({ ...base, lat: telAviv.lat + 0.0006 }, 1000 + 2000)).toBe(true);
    // ~0.0002° latitude ≈ 22 m
    expect(shouldPersist({ ...base, lat: telAviv.lat + 0.0002 }, 1000 + 2000)).toBe(false);
  });
});
