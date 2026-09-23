import axios from 'axios';

// The access token lives in memory only (never localStorage) so injected scripts can't read it
// from storage. The refresh token is an httpOnly cookie the browser sends for us.
let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
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

// Turns any axios failure into { code, message, fieldErrors } with a plain-language message.
// fieldErrors maps a field name to its first message, from the server's VALIDATION_ERROR details.
export function toApiError(err) {
  const body = err?.response?.data?.error;

  if (body) {
    const fieldErrors = {};
    for (const [field, messages] of Object.entries(body.details ?? {})) {
      if (Array.isArray(messages) && messages.length) fieldErrors[field] = messages[0];
    }
    return { code: body.code, message: body.message, fieldErrors };
  }

  if (err?.code === 'ECONNABORTED') {
    return { code: 'TIMEOUT', message: 'The server took too long to answer. Check your connection and try again.', fieldErrors: {} };
  }
  if (!err?.response) {
    return { code: 'NETWORK', message: "Can't reach B SOS. Check your internet connection and try again.", fieldErrors: {} };
  }
  return { code: 'UNKNOWN', message: 'Something went wrong. Please try again.', fieldErrors: {} };
}
