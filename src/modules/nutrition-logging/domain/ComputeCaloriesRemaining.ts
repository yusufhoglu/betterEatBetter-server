export function ComputeCaloriesRemaining(goal: number | null, consumed: number): number | null {
  if (goal === null) {
    return null;
  }

  return Math.max(goal - consumed, 0);
}
