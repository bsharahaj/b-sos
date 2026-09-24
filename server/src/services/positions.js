import { haversineM } from '../utils/geo.js';

// Live helper positions: written every 3–5 s by `helper:location`, read when forwarding to a requester.
// This is the in-memory implementation for local development. Production swaps it for Redis
// (`pos:{userId}` with a 60 s TTL, CLAUDE.md §4) behind the same three functions.
export const POSITION_TTL_MS = 60 * 1000;

// Postgres only needs a coarse, recent position for matching, so writes are throttled:
// persist when the last write is older than PERSIST_EVERY_MS or the helper moved more than PERSIST_MOVE_M.
export const PERSIST_EVERY_MS = 30 * 1000;
export const PERSIST_MOVE_M = 50;

const store = new Map(); // userId -> { lat, lng, accuracy, at, persistedAt, persistedPos }

export const positions = {
  set(userId, { lat, lng, accuracy }, now = Date.now()) {
    const prev = store.get(userId);
    const entry = { lat, lng, accuracy, at: now, persistedAt: prev?.persistedAt ?? 0, persistedPos: prev?.persistedPos ?? null };
    store.set(userId, entry);
    return entry;
  },

  get(userId, now = Date.now()) {
    const entry = store.get(userId);
    if (!entry) return null;
    if (now - entry.at > POSITION_TTL_MS) {
      store.delete(userId);
      return null;
    }
    return { lat: entry.lat, lng: entry.lng, accuracy: entry.accuracy, at: entry.at };
  },

  delete(userId) {
    store.delete(userId);
  },

  markPersisted(userId, now = Date.now()) {
    const entry = store.get(userId);
    if (!entry) return;
    entry.persistedAt = now;
    entry.persistedPos = { lat: entry.lat, lng: entry.lng };
  },

  // Test helper.
  clear() {
    store.clear();
  },
};

// Pure decision used by the location handler.
export function shouldPersist(entry, now = Date.now()) {
  if (!entry.persistedPos) return true;
  if (now - entry.persistedAt >= PERSIST_EVERY_MS) return true;
  return haversineM(entry, entry.persistedPos) >= PERSIST_MOVE_M;
}
