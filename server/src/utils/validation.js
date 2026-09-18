import { z } from 'zod';

// Reusable Zod field schemas shared by several routes.

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +972501234567.');
