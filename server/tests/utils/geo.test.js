import { describe, it, expect } from 'vitest';
import { boundingBox, coarsen, COARSE_RADIUS_M, haversineM } from '../../src/utils/geo.js';

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

describe('haversineM', () => {
  it('is 0 for the same point', () => {
    expect(haversineM({ lat: 32.08, lng: 34.78 }, { lat: 32.08, lng: 34.78 })).toBe(0);
  });

  it('matches known distances', () => {
    // 1° of latitude ≈ 111.2 km
    expect(haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -1);
    // Tel Aviv -> Jerusalem ≈ 54 km
    const d = haversineM({ lat: 32.0853, lng: 34.7818 }, { lat: 31.7683, lng: 35.2137 });
    expect(d).toBeGreaterThan(53_000);
    expect(d).toBeLessThan(55_000);
  });
});

describe('boundingBox', () => {
  it('contains every point on the radius circle', () => {
    const centre = { lat: 32.08, lng: 34.78 };
    const box = boundingBox(centre.lat, centre.lng, 3000);
    // Points ~3 km north/south/east/west must be inside the box.
    expect(centre.lat + 0.0269).toBeLessThan(box.maxLat);
    expect(centre.lat - 0.0269).toBeGreaterThan(box.minLat);
    const east = { lat: centre.lat, lng: box.maxLng };
    expect(haversineM(centre, east)).toBeCloseTo(3000, -1);
  });
});
