// Coarse location for people who may not see the exact point: snap to a 0.01° grid.
// A 0.01° cell is ~1.1 km north–south (less east–west away from the equator), so the true
// point is always within ~800 m of the returned one; COARSE_RADIUS_M rounds that up.
const COARSE_GRID_DEG = 0.01;
export const COARSE_RADIUS_M = 1000;

const snap = (value) => Number((Math.round(value / COARSE_GRID_DEG) * COARSE_GRID_DEG).toFixed(2));

export function coarsen(lat, lng) {
  return { lat: snap(lat), lng: snap(lng) };
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

// Great-circle distance in metres between two { lat, lng } points.
export function haversineM(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Lat/lng rectangle that contains every point within radiusM of the centre. Used as a cheap
// indexed pre-filter before the exact haversine check. Ignores the antimeridian (not relevant for us).
export function boundingBox(lat, lng, radiusM) {
  const dLat = toDeg(radiusM / EARTH_RADIUS_M);
  const dLng = toDeg(radiusM / (EARTH_RADIUS_M * Math.cos(toRad(lat))));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
}
