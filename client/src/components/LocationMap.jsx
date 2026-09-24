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
    <path d="M18 46s16-15.2 16-28A16 16 0 0 0 2 18c0 12.8 16 28 16 28Z" fill="#0f172a" stroke="#fff" stroke-width="2.5"/>
    <circle cx="18" cy="18" r="6" fill="#fff"/></svg>`,
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
export default function LocationMap({ pin, accuracy = null, followPin = true, onPinChange, interactive = true, className = '' }) {
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
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {pin && accuracy !== null && (
        <Circle
          center={[pin.lat, pin.lng]}
          radius={accuracy}
          pathOptions={{ color: '#0369a1', weight: 1.5, fillColor: '#0369a1', fillOpacity: 0.12 }}
        />
      )}
      {pin && <Pin pin={pin} draggable={interactive} onMove={onPinChange} />}
      <FollowPin pin={pin} follow={followPin} />
      {interactive && onPinChange && <TapToPlace onPlace={onPinChange} />}
    </MapContainer>
  );
}
