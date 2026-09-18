import { PrismaClient } from '@prisma/client';

// One client per process; Prisma connects lazily on the first query.
export const prisma = new PrismaClient();
