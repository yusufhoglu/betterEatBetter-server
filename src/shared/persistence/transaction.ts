import type { Prisma } from '@prisma/client';
import { prisma } from './db';

/** Repository methods accept this optionally — passed explicitly only when a caller needs outbox-style atomicity. */
export type TransactionClient = Prisma.TransactionClient;

export function withTransaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn);
}
