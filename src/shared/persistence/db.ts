import { PrismaClient } from '@prisma/client';

/** Single shared instance — repositories receive it via constructor injection, never `new PrismaClient()` themselves. */
export const prisma = new PrismaClient();
