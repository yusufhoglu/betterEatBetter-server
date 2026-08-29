import type { FavoriteRecipeCard, MeCatalogRepositoryPort, MyMealCard } from '../../ports/MeCatalogRepositoryPort';
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

interface MeCatalogDb {
  favoriteRecipe: FavoriteRecipeDelegate;
  savedMeal: SavedMealDelegate;
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
}
