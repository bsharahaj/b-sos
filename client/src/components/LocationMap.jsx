import { useEffect, useMemo } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Rough centre of the region, used only when the device gives no location at all.
const FALLBACK_CENTER = [31.77, 35.21];
const FALLBACK_ZOOM = 8;
const PIN_ZOOM = 16;

// SVG pin as a divIcon: Leaflet's default PNG marker icons break under Vite's asset handling,
// and this lets the pin use the app's colours.
const pinIcon = L.divIcon({
  className: '',
  iconSize: [36, 48],
  iconAnchor: [18, 46],
  html: `<svg width="36" height="48" viewBox="0 0 36 48" aria-hidden="true">
    <path d="M18 46s16-15.2 16-28A16 16 0 0 0 2 18c0 12.8 16 28 16 28Z" fill="#2dd4bf" stroke="#0b1220" stroke-width="2.5"/>
    <circle cx="18" cy="18" r="6" fill="#0b1220"/></svg>`,
});

// Approximate ground distance covered by `pixels` at this zoom and latitude (Web Mercator).
export function metresForPixels(lat, zoom, pixels) {
  const metresPerPixel = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** (zoom + 8);
  return Math.round(metresPerPixel * pixels);
}

// Keeps the view on the pin when it moves because of a new GPS fix (not when the user drags it).
function FollowPin({ pin, follow }) {
  const map = useMap();
  useEffect(() => {
    if (pin && follow) map.setView([pin.lat, pin.lng], Math.max(map.getZoom(), PIN_ZOOM));
  }, [map, pin, follow]);
  return null;
}

// The helper on the requester's map: a teal disc with a dark ring, clearly different from the SOS pin.
const helperIcon = L.divIcon({
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  html: `<span style="display:block;width:28px;height:28px;border-radius:50%;background:#2dd4bf;border:4px solid #0b1220;box-shadow:0 0 0 3px rgba(45,212,191,.35)"></span>`,
});

// When the helper first appears (or the pair changes), zoom out so both points are visible; afterwards
// the helper marker just moves, so the map doesn't jump every few seconds.
function FitPair({ pin, helperPin }) {
  const map = useMap();
  const key = pin && helperPin ? `${pin.lat},${pin.lng}` : null;
  useEffect(() => {
    if (!pin || !helperPin) return;
    map.fitBounds([[pin.lat, pin.lng], [helperPin.lat, helperPin.lng]], { padding: [48, 48], maxZoom: 17 });
    // Only when the helper appears or the SOS point changes; helper movement alone must not re-fit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, Boolean(helperPin)]);
  return null;
}

// Approximate ground distance between two points in metres.
export function metresBetween(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function Pin({ pin, draggable, onMove }) {
  const map = useMap();
  const eventHandlers = useMemo(
    () => ({
      dragend: (event) => {
        const { lat, lng } = event.target.getLatLng();
        onMove?.({ lat, lng }, map.getZoom());
      },
    }),
    [map, onMove],
  );

  return (
    <Marker
      position={[pin.lat, pin.lng]}
      icon={pinIcon}
      draggable={draggable}
      eventHandlers={eventHandlers}
      keyboard={false}
      title={draggable ? 'Your location. Drag to adjust.' : 'Location'}
    />
  );
}

function TapToPlace({ onPlace }) {
  const map = useMapEvents({
    click: (event) => onPlace({ lat: event.latlng.lat, lng: event.latlng.lng }, map.getZoom()),
  });
  return null;
}

// pin: { lat, lng } | null. accuracy (metres) draws the uncertainty circle; pass null to hide it.
// onPinChange(latlng, zoom) fires when the user drags the pin or taps the map.
// `interactive={false}` gives a read-only map (e.g. on the active-SOS screen).
// helperPin: { lat, lng } | null — the assigned helper's live position (requester's view).
export default function LocationMap({ pin, accuracy = null, helperPin = null, followPin = true, onPinChange, interactive = true, className = '' }) {
  return (
    <MapContainer
      center={pin ? [pin.lat, pin.lng] : FALLBACK_CENTER}
      zoom={pin ? PIN_ZOOM : FALLBACK_ZOOM}
      className={`isolate z-0 rounded-2xl border border-line ${className}`}
      scrollWheelZoom={interactive}
      dragging={interactive}
      zoomControl={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      keyboard={interactive}
    >
      {/* Dark basemap to match the theme. CARTO's free tier is fine for development; pick a paid plan before launch. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={19}
      />
      {pin && accuracy !== null && (
        <Circle
          center={[pin.lat, pin.lng]}
          radius={accuracy}
          pathOptions={{ color: '#2dd4bf', weight: 1.5, fillColor: '#2dd4bf', fillOpacity: 0.14 }}
        />
      )}
      {pin && <Pin pin={pin} draggable={interactive} onMove={onPinChange} />}
      {helperPin && <Marker position={[helperPin.lat, helperPin.lng]} icon={helperIcon} keyboard={false} title="Your helper" />}
      <FollowPin pin={pin} follow={followPin && !helperPin} />
      <FitPair pin={pin} helperPin={helperPin} />
      {interactive && onPinChange && <TapToPlace onPlace={onPinChange} />}
    </MapContainer>
  );
}
