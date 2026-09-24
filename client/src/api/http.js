import axios from 'axios';

// The access token lives in memory only (never localStorage) so injected scripts can't read it
// from storage. The refresh token is an httpOnly cookie the browser sends for us.
let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

// For the socket handshake, which can't use the axios interceptor.
export function getAccessToken() {
  return accessToken;
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  // Needed so the browser stores and sends the refresh_token cookie across origins.
  withCredentials: true,
  timeout: 15000,
});

http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// ---------- Refresh ----------
// The server rotates the refresh cookie on every use and treats a reused (already-rotated) cookie as
// theft, revoking every session. So all callers must share ONE in-flight refresh request.

let refreshPromise = null;
let onSessionExpired = () => {};

// AuthProvider registers this so a failed refresh mid-session signs the user out of the UI.
export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

// Resolves to { user, accessToken } and stores the new token, or throws toApiError's shape.
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = http
      .post('/auth/refresh', null, { skipAuthRefresh: true })
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        return data;
      })
      .catch((err) => {
        setAccessToken(null);
        throw toApiError(err);
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Access tokens last 15 min. When one expires, refresh once and replay the original request.
http.interceptors.response.use(undefined, async (err) => {
  const { config, response } = err;
  const expired = response?.status === 401 && response.data?.error?.code === 'TOKEN_EXPIRED';
  if (!expired || !config || config.skipAuthRefresh || config._retried) throw err;

  try {
    await refreshSession();
  } catch {
    onSessionExpired();
    throw err;
  }
  config._retried = true;
  return http(config);
});

// Turns any axios failure into { code, message, fieldErrors, details } with a plain-language message.
// fieldErrors maps a field name to its first message, from the server's VALIDATION_ERROR details.
// details is the server's raw details object (e.g. { attemptsLeft } or { retryAfterSec }).
export function toApiError(err) {
  const body = err?.response?.data?.error;

  if (body) {
    const details = body.details ?? {};
    const fieldErrors = {};
    for (const [field, messages] of Object.entries(details)) {
      if (Array.isArray(messages) && messages.length) fieldErrors[field] = messages[0];
    }
    return { code: body.code, message: body.message, fieldErrors, details };
  }

  if (err?.code === 'ECONNABORTED') {
    return { code: 'TIMEOUT', message: 'The server took too long to answer. Check your connection and try again.', fieldErrors: {} };
  }
  if (!err?.response) {
    return { code: 'NETWORK', message: "Can't reach B SOS. Check your internet connection and try again.", fieldErrors: {} };
  }
  return { code: 'UNKNOWN', message: 'Something went wrong. Please try again.', fieldErrors: {} };
}
