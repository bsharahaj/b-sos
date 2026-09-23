// Coarse location for people who may not see the exact point: snap to a 0.01° grid.
// A 0.01° cell is ~1.1 km north–south (less east–west away from the equator), so the true
// point is always within ~800 m of the returned one; COARSE_RADIUS_M rounds that up.
const COARSE_GRID_DEG = 0.01;
export const COARSE_RADIUS_M = 1000;

const snap = (value) => Number((Math.round(value / COARSE_GRID_DEG) * COARSE_GRID_DEG).toFixed(2));

export function coarsen(lat, lng) {
  return { lat: snap(lat), lng: snap(lng) };
}
