import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { setAccessToken, setSessionExpiredHandler } from '../api/http.js';
import { logout as logoutRequest, restoreSession } from '../api/auth.js';

export const AuthContext = createContext(null);

// status: 'loading' while the refresh cookie is being checked on page load,
// then 'authenticated' or 'anonymous'.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  const startSession = useCallback(({ user: nextUser, accessToken }) => {
    setAccessToken(accessToken);
    setUser(nextUser);
    setStatus('authenticated');
  }, []);

  const endSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    endSession();
  }, [endSession]);

  // The access token lives only in memory, so a reload loses it; the httpOnly refresh cookie gets it back.
  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then(({ user: restored }) => {
        if (!cancelled) {
          setUser(restored);
          setStatus('authenticated');
        }
      })
      .catch(() => {
        if (!cancelled) endSession();
      });
    return () => {
      cancelled = true;
    };
  }, [endSession]);

  useEffect(() => {
    setSessionExpiredHandler(endSession);
    return () => setSessionExpiredHandler(() => {});
  }, [endSession]);

  const value = useMemo(() => ({ user, status, startSession, logout }), [user, status, startSession, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
