import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { socket } from '../api/socket.js';

const SEND_EVERY_MS = 4000;

// While the signed-in user is an available helper, stream their position to the server
// (`helper:location`, every ~4 s) so matching can find them and, later, requesters can watch them approach.
// Renders nothing. Mounted once inside the signed-in area of the app.
export default function HelperPresence() {
  const { helperProfile } = useAuth();
  const available = Boolean(helperProfile?.isAvailable);

  useEffect(() => {
    if (!available || !('geolocation' in navigator)) return undefined;

    let latest = null;
    let lastSentAt = 0;

    const send = () => {
      if (!latest || !socket.connected) return;
      lastSentAt = Date.now();
      socket.emit('helper:location', latest);
    };

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        latest = { lat: coords.latitude, lng: coords.longitude, accuracy: Math.round(coords.accuracy) };
        // First fix goes out immediately; after that the interval below paces the sends.
        if (Date.now() - lastSentAt >= SEND_EVERY_MS) send();
      },
      () => {
        // Permission denied or unavailable: nothing to send. The Profile page explains why location matters.
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );

    const timer = setInterval(send, SEND_EVERY_MS);
    // A reconnect should push the current position right away rather than wait for the next tick.
    socket.on('connect', send);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(timer);
      socket.off('connect', send);
    };
  }, [available]);

  return null;
}
