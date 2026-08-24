import type { FavoriteRecipeCard, MeCatalogRepositoryPort, MyMealCard } from '../../ports/MeCatalogRepositoryPort';
import { NotFoundError } from '../../../../shared/errors/NotFoundError';

interface FavoriteRecipeDelegate {
  create(args: {
    data: {
      userId: string;
      title: string;
      imageUrl: string | null;
      emoji: string | null;
      kcal: number;
      prepTimeMinutes: number;
    };
  }): Promise<{
    id: string;
    title: string;
    imageUrl: string | null;
    emoji: string | null;
    kcal: number;
    prepTimeMinutes: number;
  }>;
  deleteMany(args: { where: { id: string; userId: string } }): Promise<{ count: number }>;
  findMany(args: { where: { userId: string }; orderBy: { createdAt: 'desc' } }): Promise<
    Array<{
      id: string;
      title: string;
      imageUrl: string | null;
      emoji: string | null;
      kcal: number;
      prepTimeMinutes: number;
    }>
  >;
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
    };
  }): Promise<{
    id: string;
    title: string;
    imageUrl: string | null;
    emoji: string | null;
    kcal: number;
    proteinG: number;
  }>;
  findFirst(args: { where: { id: string; userId: string } }): Promise<{
    id: string;
    title: string;
    imageUrl: string | null;
    emoji: string | null;
    kcal: number;
    proteinG: number;
  } | null>;
  update(args: {
    where: { id: string };
    data: {
      title?: string;
      imageUrl?: string | null;
      emoji?: string | null;
      kcal?: number;
      proteinG?: number;
    };
  }): Promise<{
    id: string;
    title: string;
    imageUrl: string | null;
    emoji: string | null;
    kcal: number;
    proteinG: number;
  }>;
  deleteMany(args: { where: { id: string; userId: string } }): Promise<{ count: number }>;
  findMany(args: { where: { userId: string }; orderBy: { createdAt: 'desc' } }): Promise<
    Array<{
      id: string;
      title: string;
      imageUrl: string | null;
      emoji: string | null;
      kcal: number;
      proteinG: number;
    }>
  >;
}

interface MeCatalogDb {
  favoriteRecipe: FavoriteRecipeDelegate;
  savedMeal: SavedMealDelegate;
}

export class PrismaMeCatalogRepository implements MeCatalogRepositoryPort {
  constructor(private readonly db: MeCatalogDb) {}

  async listFavoriteRecipes(userId: string): Promise<FavoriteRecipeCard[]> {
    const rows = await this.db.favoriteRecipe.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      imageUrl: row.imageUrl,
      emoji: row.emoji,
      kcal: row.kcal,
      prepTimeMinutes: row.prepTimeMinutes,
    }));
  }

  async createFavoriteRecipe(input: {
    userId: string;
    title: string;
    imageUrl?: string | null;
    emoji?: string | null;
    kcal: number;
    prepTimeMinutes: number;
  }): Promise<FavoriteRecipeCard> {
    const row = await this.db.favoriteRecipe.create({
      data: {
        userId: input.userId,
        title: input.title,
        imageUrl: input.imageUrl ?? null,
        emoji: input.emoji ?? null,
        kcal: input.kcal,
        prepTimeMinutes: input.prepTimeMinutes,
      },
    });

    return {
      id: row.id,
      title: row.title,
      imageUrl: row.imageUrl,
      emoji: row.emoji,
      kcal: row.kcal,
      prepTimeMinutes: row.prepTimeMinutes,
    };
  }

  async deleteFavoriteRecipe(userId: string, id: string): Promise<void> {
    const result = await this.db.favoriteRecipe.deleteMany({
      where: { id, userId },
    });

    if (result.count === 0) {
      throw new NotFoundError('FAVORITE_RECIPE_NOT_FOUND', 'Favorite recipe was not found');
    }
  }

  async listMyMeals(userId: string): Promise<MyMealCard[]> {
    const rows = await this.db.savedMeal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      imageUrl: row.imageUrl,
      emoji: row.emoji,
      kcal: row.kcal,
      proteinG: row.proteinG,
    }));
  }

  async createMyMeal(input: {
    userId: string;
    title: string;
    imageUrl?: string | null;
    emoji?: string | null;
    kcal: number;
    proteinG: number;
  }): Promise<MyMealCard> {
    const row = await this.db.savedMeal.create({
      data: {
        userId: input.userId,
        title: input.title,
        imageUrl: input.imageUrl ?? null,
        emoji: input.emoji ?? null,
        kcal: input.kcal,
        proteinG: input.proteinG,
      },
    });

    return {
      id: row.id,
      title: row.title,
      imageUrl: row.imageUrl,
      emoji: row.emoji,
      kcal: row.kcal,
      proteinG: row.proteinG,
    };
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

    return {
      id: updated.id,
      title: updated.title,
      imageUrl: updated.imageUrl,
      emoji: updated.emoji,
      kcal: updated.kcal,
      proteinG: updated.proteinG,
    };
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
