import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.use('/auth', authRouter);
  app.use('/me', meRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
