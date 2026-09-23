import { Router } from 'express';
import { z } from 'zod';
import { SOS_TYPES } from '../../../shared/constants.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import * as sosService from '../services/sos.js';

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

// ---------- Routes ----------

export const sosRouter = Router();

sosRouter.use(requireAuth);

sosRouter.post('/', validate({ body: createSosSchema }), async (req, res) => {
  res.status(201).json(await sosService.createSos(req.user.id, req.body));
});

sosRouter.get('/:id', validate({ params: sosIdParams }), async (req, res) => {
  res.json(await sosService.getSos(req.validated.params.id, req.user.id));
});
