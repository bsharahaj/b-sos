import { useCallback, useEffect, useState } from 'react';

const SAMPLE_WINDOW_MS = 5000;

// Finds the device's position for an SOS (CLAUDE.md §4 "Location quality"):
// watchPosition with high accuracy, keep the most accurate sample seen in the first 5 s, then stop.
// If no fix has arrived after 5 s it keeps waiting for the first one.
//
// Returns { position: { lat, lng, accuracy } | null, error: 'denied' | 'unavailable' | 'unsupported' | null,
//           searching, retry }.
export function useGeolocation() {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('unsupported');
      setSearching(false);
      return undefined;
    }

    setError(null);
    setSearching(true);

    let best = null;
    let windowOver = false;
    let watchId = null;

    const stop = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      setSearching(false);
    };

    watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (!best || coords.accuracy < best.accuracy) {
          best = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy };
          setPosition(best);
        }
        if (windowOver) stop();
      },
      (err) => {
        // A late timeout after we already have a fix is harmless; keep the fix.
        if (best) return stop();
        setError(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );

    const timer = setTimeout(() => {
      windowOver = true;
      if (best) stop();
    }, SAMPLE_WINDOW_MS);

    return () => {
      clearTimeout(timer);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { position, error, searching, retry };
}
