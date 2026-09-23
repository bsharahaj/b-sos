import { describe, it, expect } from 'vitest';
import { coarsen, COARSE_RADIUS_M } from '../../src/utils/geo.js';

// Rough metres between two nearby points (equirectangular approximation, fine at this scale).
function metresBetween(a, b) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const x = toRad(b.lng - a.lng) * Math.cos(toRad((a.lat + b.lat) / 2));
  const y = toRad(b.lat - a.lat);
  return Math.hypot(x, y) * R;
}

describe('coarsen', () => {
  it('snaps to a 0.01° grid', () => {
    expect(coarsen(32.08534, 34.78176)).toEqual({ lat: 32.09, lng: 34.78 });
    expect(coarsen(-33.86881, 151.20929)).toEqual({ lat: -33.87, lng: 151.21 });
  });

  it('returns the same point for everything in one cell', () => {
    expect(coarsen(32.0851, 34.7751)).toEqual(coarsen(32.0949, 34.7849));
  });

  it('always stays within COARSE_RADIUS_M of the true point', () => {
    for (const lat of [0, 31.5, 60]) {
      const worst = { lat: lat + 0.00499, lng: 34.00499 }; // near a cell corner
      expect(metresBetween(worst, coarsen(worst.lat, worst.lng))).toBeLessThan(COARSE_RADIUS_M);
    }
  });
});
