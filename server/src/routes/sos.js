import { Router } from 'express';
import { z } from 'zod';
import { SOS_TYPES } from '../../../shared/constants.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import * as sosService from '../services/sos.js';
import * as lifecycle from '../services/sosLifecycle.js';
import { STATUSES } from '../../../shared/constants.js';

// ---------- Schemas ----------

const createSosSchema = z.strictObject({
  type: z.enum(Object.values(SOS_TYPES)),
  description: z.string().trim().max(500).optional(),
  photoUrl: z.url({ protocol: /^https$/, message: 'Photo must be an https URL.' }).max(2048).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  // Reported by the browser's Geolocation API; required so the UI can show the uncertainty circle.
  accuracyM: z.number().nonnegative().max(100_000),
});

const sosIdParams = z.object({ id: z.uuid('Invalid SOS id.') });

const cancelSchema = z.strictObject({ reason: z.string().trim().max(200).optional() });

// ---------- Routes ----------

export const sosRouter = Router();

sosRouter.use(requireAuth);

sosRouter.post('/', validate({ body: createSosSchema }), async (req, res) => {
  res.status(201).json(await sosService.createSos(req.user.id, req.body));
});

// Declared before '/:id' so "alerts" isn't parsed as an id.
sosRouter.get('/alerts', async (req, res) => {
  res.json(await sosService.listAlerts(req.user.id));
});

sosRouter.get('/:id', validate({ params: sosIdParams }), async (req, res) => {
  res.json(await sosService.getSos(req.validated.params.id, req.user.id));
});

sosRouter.post('/:id/cancel', validate({ params: sosIdParams, body: cancelSchema }), async (req, res) => {
  const { id } = req.validated.params;
  const { cancelledBy } = await lifecycle.cancelSos(id, req.user.id, req.body.reason);
  const { sos } = await sosService.getSos(id, req.user.id);
  res.json({ sos: { ...sos, cancelledBy } });
});

// First helper to accept wins; the SOS row is locked inside a transaction (see sosLifecycle.acceptSos).
sosRouter.post('/:id/accept', validate({ params: sosIdParams }), async (req, res) => {
  const { id } = req.validated.params;
  const { etaMin } = await lifecycle.acceptSos(id, req.user.id);
  const { sos } = await sosService.getSos(id, req.user.id);
  res.json({ sos, etaMin });
});

sosRouter.post('/:id/decline', validate({ params: sosIdParams }), async (req, res) => {
  await lifecycle.declineSos(req.validated.params.id, req.user.id);
  res.json({ ok: true });
});

// Progress steps. The helper reports en-route and arrived; either party may resolve once arrived.
const progressRoute = (path, to) =>
  sosRouter.post(`/:id/${path}`, validate({ params: sosIdParams }), async (req, res) => {
    const { id } = req.validated.params;
    await lifecycle.progressSos(id, req.user.id, to);
    const { sos } = await sosService.getSos(id, req.user.id);
    res.json({ sos });
  });

progressRoute('en-route', STATUSES.EN_ROUTE);
progressRoute('arrived', STATUSES.ARRIVED);
progressRoute('resolve', STATUSES.RESOLVED);
