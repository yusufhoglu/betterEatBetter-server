const requiredMealTypes = ['breakfast', 'lunch', 'dinner'] as const;

/** Applies the current product policy for whether a day counts as completed. */
export function defineDayCompletion(loggedMealTypes: string[]): boolean {
  const loggedSet = new Set(loggedMealTypes);
  return requiredMealTypes.every((mealType) => loggedSet.has(mealType));
}
