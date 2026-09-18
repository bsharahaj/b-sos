import { logger } from '../config/logger.js';

export function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
}

// Express 5 forwards rejected promises from async handlers here automatically.
// The 4-argument signature is what marks this as an error handler, so `next` must stay.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status ?? err.statusCode ?? 500;
  const isServerError = status >= 500;

  if (isServerError) logger.error({ err }, 'Unhandled error');

  res.status(status).json({
    error: {
      code: err.code ?? (isServerError ? 'INTERNAL_ERROR' : 'BAD_REQUEST'),
      message: isServerError ? 'Something went wrong. Please try again.' : err.message,
      ...(err.details && { details: err.details }),
    },
  });
}
