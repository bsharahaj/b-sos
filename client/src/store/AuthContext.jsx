import { createContext, useCallback, useMemo, useState } from 'react';
import { setAccessToken } from '../api/http.js';

export const AuthContext = createContext(null);

// Holds the signed-in user. Session restore on page reload (/auth/refresh) comes with the refresh interceptor.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const startSession = useCallback(({ user: nextUser, accessToken }) => {
    setAccessToken(accessToken);
    setUser(nextUser);
  }, []);

  const value = useMemo(() => ({ user, startSession }), [user, startSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
