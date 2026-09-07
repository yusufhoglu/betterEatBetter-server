import type { Prisma } from '@prisma/client';
import type {
  FavoriteRecipeCard,
  MeCatalogRepositoryPort,
  MyMealCard,
  SavedRecipeCard,
} from '../../ports/MeCatalogRepositoryPort';
import type { Recipe, RecipeIngredient } from '../../../dietician/domain/Recipe';
import { NotFoundError } from '../../../../shared/errors/NotFoundError';
import { createFinalDownloadUrl } from '../../../../shared/storage/presignedUrl';

interface SavedMealRow {
  id: string;
  title: string;
  imageUrl: string | null;
  emoji: string | null;
  kcal: number;
  proteinG: number;
  carbsG: number | null;
  fatG: number | null;
  mealPhotoId: string | null;
  mealPhotoOwnerId: string | null;
}

interface FavoriteRecipeRow {
  id: string;
  title: string;
  imageUrl: string | null;
  emoji: string | null;
  kcal: number;
  prepTimeMinutes: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  mealPhotoId: string | null;
  mealPhotoOwnerId: string | null;
}

interface FavoriteRecipeDelegate {
  create(args: {
    data: {
      userId: string;
      title: string;
      imageUrl: string | null;
      emoji: string | null;
      kcal: number;
      prepTimeMinutes?: number | null;
      proteinG?: number | null;
      carbsG?: number | null;
      fatG?: number | null;
      mealPhotoId?: string | null;
      mealPhotoOwnerId?: string | null;
    };
  }): Promise<FavoriteRecipeRow>;
  findFirst(args: {
    where: { userId: string; mealPhotoId?: string };
  }): Promise<FavoriteRecipeRow | null>;
  deleteMany(args: { where: { id: string; userId: string } }): Promise<{ count: number }>;
  findMany(args: {
    where: { userId: string };
    orderBy: { createdAt: 'desc' };
  }): Promise<FavoriteRecipeRow[]>;
}

interface SavedMealDelegate {
  create(args: {
    data: {
      userId: string;
      title: string;
      imageUrl: string | null;
      emoji: string | null;
      kcal: number;
      proteinG: number;
      carbsG?: number | null;
      fatG?: number | null;
      mealPhotoId?: string | null;
      mealPhotoOwnerId?: string | null;
    };
  }): Promise<SavedMealRow>;
  findFirst(args: {
    where: { id?: string; userId: string; mealPhotoId?: string };
  }): Promise<SavedMealRow | null>;
  update(args: {
    where: { id: string };
    data: {
      title?: string;
      imageUrl?: string | null;
      emoji?: string | null;
      kcal?: number;
      proteinG?: number;
    };
  }): Promise<SavedMealRow>;
  deleteMany(args: { where: { id: string; userId: string } }): Promise<{ count: number }>;
  findMany(args: {
    where: { userId: string };
    orderBy: { createdAt: 'desc' };
  }): Promise<SavedMealRow[]>;
}

interface SavedRecipeRow {
  id: string;
  title: string;
  subtitle: string | null;
  timeMinutes: number;
  servings: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number | null;
  ingredients: Prisma.JsonValue;
  steps: Prisma.JsonValue;
  why: string | null;
  mealPhotoId: string | null;
  mealPhotoOwnerId: string | null;
  createdAt: Date;
}

interface SavedRecipeWriteData {
  title: string;
  subtitle: string | null;
  timeMinutes: number;
  servings: number;
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number | null;
  ingredients: Prisma.InputJsonValue;
  steps: Prisma.InputJsonValue;
  why: string | null;
  mealPhotoId: string | null;
  mealPhotoOwnerId: string | null;
}

interface SavedRecipeDelegate {
  create(args: { data: SavedRecipeWriteData & { userId: string } }): Promise<SavedRecipeRow>;
  update(args: {
    where: { id: string };
    data: Partial<SavedRecipeWriteData>;
  }): Promise<SavedRecipeRow>;
  findFirst(args: { where: { id: string; userId: string } }): Promise<SavedRecipeRow | null>;
  deleteMany(args: { where: { id: string; userId: string } }): Promise<{ count: number }>;
  findMany(args: {
    where: { userId: string };
    orderBy: { createdAt: 'desc' };
  }): Promise<SavedRecipeRow[]>;
}

interface MeCatalogDb {
  favoriteRecipe: FavoriteRecipeDelegate;
  savedMeal: SavedMealDelegate;
  savedRecipe: SavedRecipeDelegate;
}

/** The scalar/JSON columns that carry a Recipe — shared by create and update. */
function recipeColumns(recipe: Recipe): Omit<SavedRecipeWriteData, 'mealPhotoId' | 'mealPhotoOwnerId'> {
  return {
    title: recipe.title,
    subtitle: recipe.subtitle ?? null,
    timeMinutes: recipe.timeMinutes,
    servings: recipe.servings,
    calories: recipe.calories,
    proteinGrams: recipe.proteinGrams,
    carbsGrams: recipe.carbsGrams,
    fatGrams: recipe.fatGrams,
    fiberGrams: recipe.fiberGrams ?? null,
    ingredients: recipe.ingredients as unknown as Prisma.InputJsonValue,
    steps: recipe.steps as unknown as Prisma.InputJsonValue,
    why: recipe.why ?? null,
  };
}

type PhotoColumns = Pick<SavedRecipeWriteData, 'mealPhotoId' | 'mealPhotoOwnerId'>;

/**
 * `{ mealPhotoId, mealPhotoOwnerId }` for a value that is always present. A bare
 * `mealPhotoId` (freshly uploaded) is owned by the caller; an explicit owner
 * means the photo already lives under another user; `null` means no photo.
 */
function photoColumns(
  userId: string,
  mealPhotoId: string | null,
  mealPhotoOwnerId: string | null | undefined,
): PhotoColumns {
  if (mealPhotoId === null) {
    return { mealPhotoId: null, mealPhotoOwnerId: null };
  }
  return { mealPhotoId, mealPhotoOwnerId: mealPhotoOwnerId ?? userId };
}

export class PrismaMeCatalogRepository implements MeCatalogRepositoryPort {
  constructor(private readonly db: MeCatalogDb) {}

  /** A favorite saved from the Social feed gets its photo re-signed on every read. */
  private async toFavoriteRecipeCard(row: FavoriteRecipeRow): Promise<FavoriteRecipeCard> {
    let imageUrl = row.imageUrl;
    if (row.mealPhotoId && row.mealPhotoOwnerId) {
      imageUrl = await createFinalDownloadUrl(row.mealPhotoOwnerId, row.mealPhotoId).catch(
        () => null,
      );
    }
    return {
      id: row.id,
      title: row.title,
      imageUrl,
      emoji: row.emoji,
      kcal: row.kcal,
      prepTimeMinutes: row.prepTimeMinutes,
      proteinG: row.proteinG,
      carbsG: row.carbsG,
      fatG: row.fatG,
      mealPhotoId: row.mealPhotoId,
    };
  }

  async listFavoriteRecipes(userId: string): Promise<FavoriteRecipeCard[]> {
    const rows = await this.db.favoriteRecipe.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((row) => this.toFavoriteRecipeCard(row)));
  }

  async createFavoriteRecipe(input: {
    userId: string;
    title: string;
    imageUrl?: string | null;
    emoji?: string | null;
    kcal: number;
    prepTimeMinutes?: number | null;
    proteinG?: number | null;
    carbsG?: number | null;
    fatG?: number | null;
    mealPhotoId?: string | null;
    mealPhotoOwnerId?: string | null;
  }): Promise<FavoriteRecipeCard> {
    // Saving the same Social meal twice is a no-op.
    if (input.mealPhotoId) {
      const existing = await this.db.favoriteRecipe.findFirst({
        where: { userId: input.userId, mealPhotoId: input.mealPhotoId },
      });
      if (existing) {
        return this.toFavoriteRecipeCard(existing);
      }
    }

    try {
      const row = await this.db.favoriteRecipe.create({
        data: {
          userId: input.userId,
          title: input.title,
          imageUrl: input.imageUrl ?? null,
          emoji: input.emoji ?? null,
          kcal: input.kcal,
          prepTimeMinutes: input.prepTimeMinutes ?? null,
          proteinG: input.proteinG ?? null,
          carbsG: input.carbsG ?? null,
          fatG: input.fatG ?? null,
          mealPhotoId: input.mealPhotoId ?? null,
          mealPhotoOwnerId: input.mealPhotoOwnerId ?? null,
        },
      });
      return this.toFavoriteRecipeCard(row);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002' && input.mealPhotoId) {
        const existing = await this.db.favoriteRecipe.findFirst({
          where: { userId: input.userId, mealPhotoId: input.mealPhotoId },
        });
        if (existing) {
          return this.toFavoriteRecipeCard(existing);
        }
      }
      throw err;
    }
  }

  async deleteFavoriteRecipe(userId: string, id: string): Promise<void> {
    const result = await this.db.favoriteRecipe.deleteMany({
      where: { id, userId },
    });

    if (result.count === 0) {
      throw new NotFoundError('FAVORITE_RECIPE_NOT_FOUND', 'Favorite recipe was not found');
    }
  }

  /**
   * A meal saved with a photo reference (from the Social feed) gets a fresh
   * signed URL every read, so it never expires. Otherwise the stored `imageUrl`.
   */
  private async toMyMealCard(row: SavedMealRow): Promise<MyMealCard> {
    let imageUrl = row.imageUrl;
    if (row.mealPhotoId && row.mealPhotoOwnerId) {
      imageUrl = await createFinalDownloadUrl(row.mealPhotoOwnerId, row.mealPhotoId).catch(
        () => null,
      );
    }
    return {
      id: row.id,
      title: row.title,
      imageUrl,
      emoji: row.emoji,
      kcal: row.kcal,
      proteinG: row.proteinG,
      carbsG: row.carbsG,
      fatG: row.fatG,
      mealPhotoId: row.mealPhotoId,
    };
  }

  async listMyMeals(userId: string): Promise<MyMealCard[]> {
    const rows = await this.db.savedMeal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((row) => this.toMyMealCard(row)));
  }

  async createMyMeal(input: {
    userId: string;
    title: string;
    imageUrl?: string | null;
    emoji?: string | null;
    kcal: number;
    proteinG: number;
    carbsG?: number | null;
    fatG?: number | null;
    mealPhotoId?: string | null;
    mealPhotoOwnerId?: string | null;
  }): Promise<MyMealCard> {
    // Saving the same Social meal twice is a no-op — return the existing card.
    if (input.mealPhotoId) {
      const existing = await this.db.savedMeal.findFirst({
        where: { userId: input.userId, mealPhotoId: input.mealPhotoId },
      });
      if (existing) {
        return this.toMyMealCard(existing);
      }
    }

    try {
      const row = await this.db.savedMeal.create({
        data: {
          userId: input.userId,
          title: input.title,
          imageUrl: input.imageUrl ?? null,
          emoji: input.emoji ?? null,
          kcal: input.kcal,
          proteinG: input.proteinG,
          carbsG: input.carbsG ?? null,
          fatG: input.fatG ?? null,
          mealPhotoId: input.mealPhotoId ?? null,
          mealPhotoOwnerId: input.mealPhotoOwnerId ?? null,
        },
      });
      return this.toMyMealCard(row);
    } catch (err) {
      // Lost a race on the (userId, mealPhotoId) unique index.
      if ((err as { code?: string }).code === 'P2002' && input.mealPhotoId) {
        const existing = await this.db.savedMeal.findFirst({
          where: { userId: input.userId, mealPhotoId: input.mealPhotoId },
        });
        if (existing) {
          return this.toMyMealCard(existing);
        }
      }
      throw err;
    }
  }

  async updateMyMeal(input: {
    userId: string;
    id: string;
    title?: string;
    imageUrl?: string | null;
    emoji?: string | null;
    kcal?: number;
    proteinG?: number;
  }): Promise<MyMealCard> {
    const existing = await this.db.savedMeal.findFirst({
      where: { id: input.id, userId: input.userId },
    });
    if (!existing) {
      throw new NotFoundError('SAVED_MEAL_NOT_FOUND', 'Saved meal was not found');
    }

    const updated = await this.db.savedMeal.update({
      where: { id: input.id },
      data: {
        title: input.title,
        imageUrl: input.imageUrl,
        emoji: input.emoji,
        kcal: input.kcal,
        proteinG: input.proteinG,
      },
    });
    return this.toMyMealCard(updated);
  }

  async deleteMyMeal(userId: string, id: string): Promise<void> {
    const result = await this.db.savedMeal.deleteMany({
      where: { id, userId },
    });

    if (result.count === 0) {
      throw new NotFoundError('SAVED_MEAL_NOT_FOUND', 'Saved meal was not found');
    }
  }

  /** Rebuilds the full Recipe object and re-signs the attached photo (if any) on every read. */
  private async toSavedRecipeCard(row: SavedRecipeRow): Promise<SavedRecipeCard> {
    const recipe: Recipe = {
      title: row.title,
      timeMinutes: row.timeMinutes,
      servings: row.servings,
      calories: row.calories,
      proteinGrams: row.proteinGrams,
      carbsGrams: row.carbsGrams,
      fatGrams: row.fatGrams,
      ingredients: (row.ingredients as unknown as RecipeIngredient[]) ?? [],
      steps: (row.steps as unknown as string[]) ?? [],
      ...(row.subtitle !== null ? { subtitle: row.subtitle } : {}),
      ...(row.fiberGrams !== null ? { fiberGrams: row.fiberGrams } : {}),
      ...(row.why !== null ? { why: row.why } : {}),
    };

    let imageUrl: string | null = null;
    if (row.mealPhotoId && row.mealPhotoOwnerId) {
      imageUrl = await createFinalDownloadUrl(row.mealPhotoOwnerId, row.mealPhotoId).catch(
        () => null,
      );
    }

    return {
      id: row.id,
      recipe,
      imageUrl,
      mealPhotoId: row.mealPhotoId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listSavedRecipes(userId: string): Promise<SavedRecipeCard[]> {
    const rows = await this.db.savedRecipe.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((row) => this.toSavedRecipeCard(row)));
  }

  async createSavedRecipe(input: {
    userId: string;
    recipe: Recipe;
    mealPhotoId?: string | null;
    mealPhotoOwnerId?: string | null;
  }): Promise<SavedRecipeCard> {
    const row = await this.db.savedRecipe.create({
      data: {
        userId: input.userId,
        ...recipeColumns(input.recipe),
        // `mealPhotoId ?? null` is never undefined, so photoColumns always
        // returns both photo fields — the create `data` stays complete.
        ...photoColumns(input.userId, input.mealPhotoId ?? null, input.mealPhotoOwnerId),
      },
    });
    return this.toSavedRecipeCard(row);
  }

  async updateSavedRecipe(input: {
    userId: string;
    id: string;
    recipe?: Recipe;
    mealPhotoId?: string | null;
    mealPhotoOwnerId?: string | null;
  }): Promise<SavedRecipeCard> {
    const existing = await this.db.savedRecipe.findFirst({
      where: { id: input.id, userId: input.userId },
    });
    if (!existing) {
      throw new NotFoundError('SAVED_RECIPE_NOT_FOUND', 'Saved recipe was not found');
    }

    const updated = await this.db.savedRecipe.update({
      where: { id: input.id },
      data: {
        ...(input.recipe ? recipeColumns(input.recipe) : {}),
        // `undefined` ⇒ leave the photo as-is; a value (incl. `null`) ⇒ replace it.
        ...(input.mealPhotoId !== undefined
          ? photoColumns(input.userId, input.mealPhotoId, input.mealPhotoOwnerId)
          : {}),
      },
    });
    return this.toSavedRecipeCard(updated);
  }

  async deleteSavedRecipe(userId: string, id: string): Promise<void> {
    const result = await this.db.savedRecipe.deleteMany({
      where: { id, userId },
    });

    if (result.count === 0) {
      throw new NotFoundError('SAVED_RECIPE_NOT_FOUND', 'Saved recipe was not found');
    }
  }
}
