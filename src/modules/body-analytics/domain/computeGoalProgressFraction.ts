export function computeGoalProgressFraction(
  startValue: number,
  currentValue: number,
  targetValue: number | null,
): number | null {
  if (targetValue === null) {
    return null;
  }

  const totalDistance = Math.abs(startValue - targetValue);
  if (totalDistance === 0) {
    return currentValue === targetValue ? 1 : 0;
  }

  if ((startValue > targetValue && currentValue <= targetValue) || (startValue < targetValue && currentValue >= targetValue)) {
    return 1;
  }

  const covered = totalDistance - Math.abs(currentValue - targetValue);
  const fraction = covered / totalDistance;
  return Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
}
