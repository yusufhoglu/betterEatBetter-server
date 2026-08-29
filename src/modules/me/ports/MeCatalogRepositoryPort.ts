export interface FavoriteRecipeCard {
  id: string;
  title: string;
  /** Fresh signed URL when the favorite has a Social photo reference, else the stored value. */
  imageUrl: string | null;
  emoji: string | null;
  kcal: number;
  /** Only set for hand-added recipes. */
  prepTimeMinutes: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  /** The source Social meal-photo id, when saved from the feed (else null). */
  mealPhotoId: string | null;
}

export interface MyMealCard {
  id: string;
  title: string;
  /** Fresh signed URL when the meal was saved with a photo reference, else the stored value. */
  imageUrl: string | null;
  emoji: string | null;
  kcal: number;
  proteinG: number;
  carbsG: number | null;
  fatG: number | null;
  /** The source Social meal-photo id, when saved from the feed (else null). */
  mealPhotoId: string | null;
}

export interface MeCatalogRepositoryPort {
  listFavoriteRecipes(userId: string): Promise<FavoriteRecipeCard[]>;
  createFavoriteRecipe(input: {
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
  }): Promise<FavoriteRecipeCard>;
  deleteFavoriteRecipe(userId: string, id: string): Promise<void>;
  listMyMeals(userId: string): Promise<MyMealCard[]>;
  createMyMeal(input: {
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
  }): Promise<MyMealCard>;
  updateMyMeal(input: {
    userId: string;
    id: string;
    title?: string;
    imageUrl?: string | null;
    emoji?: string | null;
    kcal?: number;
    proteinG?: number;
  }): Promise<MyMealCard>;
  deleteMyMeal(userId: string, id: string): Promise<void>;
}
