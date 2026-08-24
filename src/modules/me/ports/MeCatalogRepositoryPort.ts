export interface FavoriteRecipeCard {
  id: string;
  title: string;
  imageUrl: string | null;
  emoji: string | null;
  kcal: number;
  prepTimeMinutes: number;
}

export interface MyMealCard {
  id: string;
  title: string;
  imageUrl: string | null;
  emoji: string | null;
  kcal: number;
  proteinG: number;
}

export interface MeCatalogRepositoryPort {
  listFavoriteRecipes(userId: string): Promise<FavoriteRecipeCard[]>;
  createFavoriteRecipe(input: {
    userId: string;
    title: string;
    imageUrl?: string | null;
    emoji?: string | null;
    kcal: number;
    prepTimeMinutes: number;
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
