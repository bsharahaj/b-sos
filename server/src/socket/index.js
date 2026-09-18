import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// JWT handshake auth and room joins (user:{id}, sos:{id}) are added with the auth feature.
export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
  });

  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'Socket connected');
    socket.on('disconnect', (reason) => logger.debug({ socketId: socket.id, reason }, 'Socket disconnected'));
  });

  return io;
}
