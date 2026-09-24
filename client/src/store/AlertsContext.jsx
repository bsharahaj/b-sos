import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { getAlerts } from '../api/sos.js';
import { socket } from '../api/socket.js';

export const AlertsContext = createContext(null);

// Incoming SOS alerts for this user as a helper.
// alert: { sosId, type, distanceM, requesterRating, createdAt }
// - loaded from GET /sos/alerts when the session starts (survives reloads),
// - added live on `sos:new`, removed on `sos:taken` or when the user dismisses one.
// `latest` is the most recent live alert not yet acknowledged, shown as a banner on every screen.
export function AlertsProvider({ children }) {
  const { status } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [latest, setLatest] = useState(null);

  useEffect(() => {
    if (status !== 'authenticated') {
      setAlerts([]);
      setLatest(null);
      return undefined;
    }
    let cancelled = false;
    getAlerts()
      .then(({ alerts: list }) => {
        if (cancelled) return;
        setAlerts(
          list.map(({ sos, distanceM }) => ({
            sosId: sos.id,
            type: sos.type,
            distanceM,
            requesterRating: sos.requester.ratingAvg,
            createdAt: sos.createdAt,
          })),
        );
      })
      .catch(() => {
        // The alerts page has its own retry; a failed preload just means an empty list until then.
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    const onNew = (alert) => {
      setAlerts((prev) => [alert, ...prev.filter((a) => a.sosId !== alert.sosId)]);
      setLatest(alert);
      // Short double buzz so a helper notices even with the phone in a pocket (ignored where unsupported).
      navigator.vibrate?.([200, 100, 200]);
    };
    const onTaken = ({ sosId }) => {
      setAlerts((prev) => prev.filter((a) => a.sosId !== sosId));
      setLatest((current) => (current?.sosId === sosId ? null : current));
    };
    socket.on('sos:new', onNew);
    socket.on('sos:taken', onTaken);
    return () => {
      socket.off('sos:new', onNew);
      socket.off('sos:taken', onTaken);
    };
  }, []);

  const dismiss = useCallback((sosId) => {
    setAlerts((prev) => prev.filter((a) => a.sosId !== sosId));
    setLatest((current) => (current?.sosId === sosId ? null : current));
  }, []);

  const acknowledgeLatest = useCallback(() => setLatest(null), []);

  const value = useMemo(() => ({ alerts, latest, dismiss, acknowledgeLatest }), [alerts, latest, dismiss, acknowledgeLatest]);

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}
