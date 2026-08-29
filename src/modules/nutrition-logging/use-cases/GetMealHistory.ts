import { createFinalDownloadUrl } from '../../../shared/storage/presignedUrl';
import { AggregateMealEntries } from '../domain/AggregateMealEntries';
import type { MealType } from '../domain/MealItem';
import type { MealItemRepositoryPort } from '../ports/MealItemRepositoryPort';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/** One logged meal slot, summarised for the "My Meals" history list. */
export interface MealHistorySlot {
  date: string; // YYYY-MM-DD
  mealType: MealType;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  items: string[];
  /** Signed photo URL when a photo-scanned item is in the slot, else null. */
  photoUrl: string | null;
}

export interface GetMealHistoryInput {
  userId: string;
  limit?: number | string;
}

/**
 * The user's recent logged meals, newest-first — every meal they've eaten,
 * grouped by (date, meal slot). Read-only; the client groups by date.
 */
export class GetMealHistory {
  constructor(private readonly repository: MealItemRepositoryPort) {}

  async execute(input: GetMealHistoryInput): Promise<MealHistorySlot[]> {
    const raw = typeof input.limit === 'string' ? Number(input.limit) : input.limit;
    const limit =
      Number.isFinite(raw) && (raw as number) > 0
        ? Math.min(Math.floor(raw as number), MAX_LIMIT)
        : DEFAULT_LIMIT;

    const items = await this.repository.findRecentByUserId(input.userId, limit);

    return Promise.all(
      items.map(async (item) => {
        const totals = AggregateMealEntries(item.entries);
        const photoEntry = item.entries.find((e) => e.mealPhotoId);
        const photoUrl = photoEntry?.mealPhotoId
          ? await createFinalDownloadUrl(input.userId, photoEntry.mealPhotoId).catch(() => null)
          : null;

        return {
          date: item.date.toISOString().slice(0, 10),
          mealType: item.mealType,
          calories: Math.round(totals.calories),
          proteinG: Math.round(totals.proteinG),
          carbsG: Math.round(totals.carbsG),
          fatG: Math.round(totals.fatG),
          items: item.entries.map((e) => e.name),
          photoUrl,
        };
      }),
    );
  }
}
