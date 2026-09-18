import http from 'node:http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './config/prisma.js';
import { createApp } from './app.js';
import { createSocketServer } from './socket/index.js';

const app = createApp();
const httpServer = http.createServer(app);
const io = createSocketServer(httpServer);

httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'B SOS server listening');
});

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  io.close();
  httpServer.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
