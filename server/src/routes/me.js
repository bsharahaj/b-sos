import { Router } from 'express';
import { z } from 'zod';
import { SKILLS } from '../../../shared/constants.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { phoneSchema } from '../utils/validation.js';
import * as meService from '../services/me.js';

// ---------- Schemas ----------
// strictObject rejects unknown keys, so fields like `role` or `email` can't be smuggled in.

const atLeastOneField = (obj) => Object.keys(obj).length > 0;

const updateMeSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(80),
    photoUrl: z.url({ protocol: /^https$/, message: 'Photo must be an https URL.' }).max(2048).nullable(),
    trustedContactPhone: phoneSchema.nullable(),
  })
  .partial()
  .refine(atLeastOneField, 'Send at least one field to update.');

const updateHelperSchema = z
  .strictObject({
    skills: z
      .array(z.enum(Object.values(SKILLS)))
      .max(Object.keys(SKILLS).length)
      .transform((skills) => [...new Set(skills)]),
    isAvailable: z.boolean(),
  })
  .partial()
  .refine(atLeastOneField, 'Send at least one field to update.');

// ---------- Routes ----------

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get('/', async (req, res) => {
  res.json(await meService.getMe(req.user.id));
});

meRouter.patch('/', validate({ body: updateMeSchema }), async (req, res) => {
  res.json(await meService.updateMe(req.user.id, req.body));
});

meRouter.patch('/helper', validate({ body: updateHelperSchema }), async (req, res) => {
  res.json(await meService.updateHelperProfile(req.user.id, req.body));
});
