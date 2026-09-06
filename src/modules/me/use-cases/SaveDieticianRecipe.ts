import { getTraceId } from '../../../shared/observability/tracer';
import type { Recipe } from '../../dietician/domain/Recipe';
import { standardizeAndCopyQueue } from '../../food-recognition/use-cases/RecognizeFromPhoto';
import type { MeCatalogRepositoryPort, SavedRecipeCard } from '../ports/MeCatalogRepositoryPort';

const JOB_RETRY_ATTEMPTS = 3;
const JOB_RETRY_BACKOFF_MS = 5_000;

export interface SaveDieticianRecipeInput {
  userId: string;
  recipe: Recipe;
  mealPhotoId?: string | null;
  mealPhotoOwnerId?: string | null;
}

/**
 * Persists a dietician-generated recipe to the user's collection. When the
 * request carries a freshly uploaded photo (a `mealPhotoId` with no explicit
 * owner), it reuses the food-recognition `standardize-and-copy` job to promote
 * `pending/<id>.jpg` → `users/<userId>/meals/<id>.jpg` so the read path can sign
 * it. `jobId = mealPhotoId` keeps it idempotent with any recognition flow that
 * already used the same photo.
 */
export class SaveDieticianRecipe {
  constructor(private readonly catalog: MeCatalogRepositoryPort) {}

  async execute(input: SaveDieticianRecipeInput): Promise<SavedRecipeCard> {
    const card = await this.catalog.createSavedRecipe(input);

    if (input.mealPhotoId && !input.mealPhotoOwnerId) {
      const traceId = getTraceId() ?? input.mealPhotoId;
      await standardizeAndCopyQueue.add(
        'standardize-and-copy',
        { mealPhotoId: input.mealPhotoId, userId: input.userId, traceId },
        {
          jobId: input.mealPhotoId,
          attempts: JOB_RETRY_ATTEMPTS,
          backoff: { type: 'fixed', delay: JOB_RETRY_BACKOFF_MS },
        },
      );
    }

    return card;
  }
}
