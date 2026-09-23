import { http, refreshSession, setAccessToken, toApiError } from './http.js';

// Each call resolves to { user, accessToken } or throws the shape returned by toApiError.

export async function login({ email, password }) {
  try {
    const { data } = await http.post('/auth/login', { email, password });
    return data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function register({ name, email, password, phone }) {
  // The server rejects an empty string for phone, so only send it when filled in.
  const body = { name, email, password, ...(phone && { phone }) };
  try {
    const { data } = await http.post('/auth/register', body);
    return data;
  } catch (err) {
    throw toApiError(err);
  }
}

// Uses the refresh cookie to get a fresh session, e.g. after a page reload.
export const restoreSession = refreshSession;

// Always clears the local token, even if the request fails (e.g. offline): the user asked to leave.
export async function logout() {
  try {
    await http.post('/auth/logout', null, { skipAuthRefresh: true });
  } catch {
    // The server-side session will expire on its own; nothing useful to tell the user.
  } finally {
    setAccessToken(null);
  }
}
