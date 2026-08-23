import type { Prisma } from '@prisma/client';
import type { TransactionClient } from './transaction';

export async function publishEvent(
  tx: TransactionClient,
  eventType: string,
  payload: Prisma.InputJsonObject,
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      eventType,
      payload,
    },
  });
}
