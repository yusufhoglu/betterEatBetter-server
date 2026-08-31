import type { PrismaClient } from '@prisma/client';
import type { TransactionClient } from '../../../shared/persistence/transaction';
import type {
  SharedMealMacros,
  SharedMealPort,
} from '../../nutrition-logging/ports/SharedMealPort';

/**
 * The `social` side of `nutrition-logging`'s [SharedMealPort]: when an author
 * edits a logged meal, push its fresh totals onto the matching feed post's
 * denormalized macro columns so the calorie / macro filter stays accurate.
 * A `updateMany` scoped to `(authorId, mealPhotoId)` is a no-op when the meal
 * was never shared.
 */
export class PrismaSharedMealSync implements SharedMealPort {
  constructor(private readonly db: PrismaClient) {}

  async syncMacros(updates: SharedMealMacros[], tx?: TransactionClient): Promise<void> {
    if (updates.length === 0) {
      return;
    }
    const client = tx ?? this.db;
    await Promise.all(
      updates.map((u) =>
        client.socialPost.updateMany({
          where: { authorId: u.userId, mealPhotoId: u.mealPhotoId },
          data: {
            calories: u.calories,
            proteinG: u.proteinG,
            carbsG: u.carbsG,
            fatG: u.fatG,
          },
        }),
      ),
    );
  }
}
