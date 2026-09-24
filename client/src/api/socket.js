import { io } from 'socket.io-client';
import { getAccessToken, refreshSession } from './http.js';

// One socket for the whole app. It's created once and connected/disconnected as the user logs in and out.
// `auth` is a function, so every (re)connection attempt sends the *current* access token.
export const socket = io(import.meta.env.VITE_SOCKET_URL ?? import.meta.env.VITE_API_URL, {
  autoConnect: false,
  withCredentials: true,
  auth: (cb) => cb({ token: getAccessToken() }),
});

let onSessionInvalid = () => {};

// AuthProvider registers this so an unrecoverable socket auth failure signs the user out.
export function setSocketSessionInvalidHandler(handler) {
  onSessionInvalid = handler;
}

// The server refuses the handshake with a code in err.message (see server/src/socket/index.js).
socket.on('connect_error', async (err) => {
  if (err.message === 'TOKEN_EXPIRED') {
    try {
      await refreshSession(); // stores the new token; the next attempt picks it up via the auth callback
      socket.connect();
    } catch {
      onSessionInvalid();
    }
    return;
  }
  if (err.message === 'INVALID_TOKEN' || err.message === 'AUTH_REQUIRED') {
    socket.disconnect();
    onSessionInvalid();
  }
  // Network errors: socket.io keeps retrying on its own.
});

export function connectSocket() {
  if (!socket.connected && !socket.active) socket.connect();
}

export function disconnectSocket() {
  socket.disconnect();
}
