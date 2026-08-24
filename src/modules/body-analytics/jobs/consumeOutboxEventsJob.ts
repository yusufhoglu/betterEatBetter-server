import type { PrismaClient } from '@prisma/client';
import { ValidationError } from '../../../shared/errors/ValidationError';
import type { MealSlot } from '../domain/bodyAnalyticsTypes';
import type { MealLogReadModelPort } from '../ports/MealLogReadModelPort';

interface MealPayloadEntry {
  name: string;
  source: string;
  portionGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface MealPayload {
  userId: string;
  date: string;
  mealType: MealSlot;
  entries: MealPayloadEntry[];
}

function parsePayload(payload: unknown): MealPayload {
  const candidate = payload as Partial<MealPayload>;
  if (!candidate.userId || !candidate.date || !candidate.mealType || !Array.isArray(candidate.entries)) {
    throw new ValidationError('INVALID_OUTBOX_PAYLOAD', 'Outbox payload is missing required meal fields');
  }

  return candidate as MealPayload;
}

/**
 * Polls the shared outbox and builds the local read model without synchronous
 * cross-module reads back into nutrition-logging.
 */
export class ConsumeOutboxEventsJob {
  constructor(
    private readonly db: PrismaClient,
    private readonly mealLogReadModelRepository: MealLogReadModelPort,
  ) {}

  async execute(limit: number = 100): Promise<number> {
    const events = await this.db.outboxEvent.findMany({
      where: {
        processedAt: null,
        eventType: { in: ['meal.logged', 'meal.updated', 'meal.deleted'] },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    let processed = 0;
    for (const event of events) {
      const payload = parsePayload(event.payload);
      const date = new Date(`${payload.date}T00:00:00.000Z`);

      try {
        if (event.eventType === 'meal.deleted') {
          await this.mealLogReadModelRepository.delete({
            userId: payload.userId,
            date,
            mealType: payload.mealType,
          });
        } else {
          await this.mealLogReadModelRepository.upsert({
            userId: payload.userId,
            date,
            mealType: payload.mealType,
            entries: payload.entries,
          });
        }

        await this.db.outboxEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date() },
        });
        processed += 1;
      } catch (error) {
        if (error instanceof ValidationError) {
          throw error;
        }
      }
    }

    return processed;
  }
}
