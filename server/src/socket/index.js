import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { registerHelperLocationHandler } from './handlers/helperLocation.js';

export const userRoom = (userId) => `user:${userId}`;
export const sosRoom = (sosId) => `sos:${sosId}`;

// The client connects with `auth: { token }` (its access token). A bad token is refused at the handshake,
// so no event handler ever runs for an anonymous socket. The error `message` is a code the client can
// act on: TOKEN_EXPIRED -> refresh and reconnect, anything else -> log in again.
function authenticate(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(socketError('AUTH_REQUIRED', 'Please log in to continue.'));

  try {
    const payload = verifyAccessToken(token);
    socket.data.userId = payload.sub;
    socket.data.role = payload.role;
    return next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return next(socketError('TOKEN_EXPIRED', 'Your session has expired. Please refresh.'));
    return next(socketError('INVALID_TOKEN', 'Your session is invalid. Please log in again.'));
  }
}

function socketError(code, message) {
  const error = new Error(code);
  error.data = { message };
  return error;
}

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
  });

  io.use(authenticate);

  io.on('connection', (socket) => {
    const { userId } = socket.data;
    // Every socket of this user (phone + laptop) shares one room, so "emit to the user" reaches all of them.
    socket.join(userRoom(userId));
    logger.debug({ socketId: socket.id, userId }, 'Socket connected');

    registerHelperLocationHandler(io, socket);

    socket.on('disconnect', (reason) => logger.debug({ socketId: socket.id, userId, reason }, 'Socket disconnected'));
  });

  return io;
}
