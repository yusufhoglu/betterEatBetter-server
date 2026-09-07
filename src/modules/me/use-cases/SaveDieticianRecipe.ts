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

export interface UpdateSavedRecipeInput {
  userId: string;
  id: string;
  recipe?: Recipe;
  mealPhotoId?: string | null;
  mealPhotoOwnerId?: string | null;
}

/**
 * Create / update a dietician-generated recipe in the user's collection. When a
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
    await this.finalizePhoto(input.userId, input.mealPhotoId, input.mealPhotoOwnerId);
    return card;
  }

  async update(input: UpdateSavedRecipeInput): Promise<SavedRecipeCard> {
    const card = await this.catalog.updateSavedRecipe(input);
    await this.finalizePhoto(input.userId, input.mealPhotoId, input.mealPhotoOwnerId);
    return card;
  }

  /** A fresh upload (id, no owner) still lives under `pending/` — promote it to the user's bucket. */
  private async finalizePhoto(
    userId: string,
    mealPhotoId?: string | null,
    mealPhotoOwnerId?: string | null,
  ): Promise<void> {
    if (!mealPhotoId || mealPhotoOwnerId) {
      return;
    }
    const traceId = getTraceId() ?? mealPhotoId;
    await standardizeAndCopyQueue.add(
      'standardize-and-copy',
      { mealPhotoId, userId, traceId },
      {
        jobId: mealPhotoId,
        attempts: JOB_RETRY_ATTEMPTS,
        backoff: { type: 'fixed', delay: JOB_RETRY_BACKOFF_MS },
      },
    );
  }
}
