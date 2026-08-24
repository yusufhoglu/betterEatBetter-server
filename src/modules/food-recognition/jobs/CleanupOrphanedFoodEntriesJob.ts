import type { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { env } from '../../../shared/config/env';
import { createModuleLogger } from '../../../shared/observability/logger';
import { deleteFinalObject } from '../../../shared/storage/presignedUrl';

const logger = createModuleLogger('food-recognition');
const CLEANUP_ELIGIBLE_STATUSES = ['completed', 'insufficient_data', 'failed'] as const;

type DbClient = Pick<PrismaClient, 'foodEntry' | 'mealItem'>;
type FoodEntryRow = {
  id: string;
  userId: string;
  status: string;
  createdAt: Date;
};

function toLoggedEntryIdsByUser(rows: Array<{ userId: string; entries: Prisma.JsonValue }>): Map<string, Set<string>> {
  const idsByUser = new Map<string, Set<string>>();

  for (const row of rows) {
    const userIds = idsByUser.get(row.userId) ?? new Set<string>();
    const entries = Array.isArray(row.entries) ? row.entries : [];

    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || !('id' in entry)) {
        continue;
      }
      const entryId = entry.id;
      if (typeof entryId === 'string' && entryId.length > 0) {
        userIds.add(entryId);
      }
    }

    idsByUser.set(row.userId, userIds);
  }

  return idsByUser;
}

/**
 * Deletes orphaned photo-recognition results that were never logged into
 * nutrition-logging. This removes both the `food_entries` row and its final
 * standardized R2 photo object.
 */
export class CleanupOrphanedFoodEntriesJob {
  constructor(
    private readonly db: DbClient,
    private readonly maxAgeHours: number = env.FOOD_ENTRY_CLEANUP_MAX_AGE_HOURS,
    private readonly batchSize: number = env.FOOD_ENTRY_CLEANUP_BATCH_SIZE,
  ) {}

  async execute(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.maxAgeHours * 60 * 60 * 1000);
    const candidates = await this.db.foodEntry.findMany({
      where: {
        status: { in: [...CLEANUP_ELIGIBLE_STATUSES] },
        createdAt: { lte: cutoff },
      },
      select: {
        id: true,
        userId: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: this.batchSize,
    });

    if (candidates.length === 0) {
      return 0;
    }

    const userIds = Array.from(new Set(candidates.map((candidate) => candidate.userId)));
    const mealItems = await this.db.mealItem.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        entries: true,
      },
    });
    const loggedEntryIdsByUser = toLoggedEntryIdsByUser(mealItems);

    let deletedCount = 0;
    for (const candidate of candidates) {
      const loggedIds = loggedEntryIdsByUser.get(candidate.userId);
      if (loggedIds?.has(candidate.id)) {
        continue;
      }

      await this.deleteOrphan(candidate);
      deletedCount += 1;
    }

    return deletedCount;
  }

  private async deleteOrphan(candidate: FoodEntryRow): Promise<void> {
    try {
      await deleteFinalObject(candidate.userId, candidate.id);
      await this.db.foodEntry.delete({ where: { id: candidate.id } });
      logger.info(
        {
          mealPhotoId: candidate.id,
          userId: candidate.userId,
          status: candidate.status,
          createdAt: candidate.createdAt.toISOString(),
        },
        'orphaned food entry cleaned up',
      );
    } catch (error) {
      logger.error(
        {
          mealPhotoId: candidate.id,
          userId: candidate.userId,
          err: error,
        },
        'failed to clean up orphaned food entry',
      );
    }
  }
}
