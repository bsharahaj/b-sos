import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { setAccessToken, setSessionExpiredHandler } from '../api/http.js';
import { logout as logoutRequest, restoreSession } from '../api/auth.js';
import { getMe } from '../api/me.js';
import { connectSocket, disconnectSocket, setSocketSessionInvalidHandler } from '../api/socket.js';

export const AuthContext = createContext(null);

// status: 'loading' while the refresh cookie is being checked on page load,
// then 'authenticated' or 'anonymous'.
// helperProfile: { skills, isAvailable, verificationStatus } | null (null until the user saves helper settings,
// undefined while it hasn't been loaded yet).
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [helperProfile, setHelperProfile] = useState(undefined);
  const [status, setStatus] = useState('loading');

  const startSession = useCallback(({ user: nextUser, accessToken }) => {
    setAccessToken(accessToken);
    setUser(nextUser);
    setStatus('authenticated');
  }, []);

  const endSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setHelperProfile(undefined);
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
    setSocketSessionInvalidHandler(endSession);
    return () => {
      setSessionExpiredHandler(() => {});
      setSocketSessionInvalidHandler(() => {});
    };
  }, [endSession]);

  // Once signed in: open the live connection and load the helper profile (needed to know whether to
  // stream this user's location). Both are torn down on sign-out.
  useEffect(() => {
    if (status !== 'authenticated') {
      disconnectSocket();
      return undefined;
    }
    connectSocket();
    let cancelled = false;
    getMe()
      .then(({ helperProfile: profile }) => {
        if (!cancelled) setHelperProfile(profile);
      })
      .catch(() => {
        // Not fatal: the Profile page loads it again, and HelperPresence simply stays off until then.
        if (!cancelled) setHelperProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  // For endpoints that return an updated user (e.g. phone verification) without a new session.
  const updateUser = useCallback((nextUser) => setUser(nextUser), []);

  const value = useMemo(
    () => ({ user, helperProfile, status, startSession, updateUser, setHelperProfile, logout }),
    [user, helperProfile, status, startSession, updateUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
