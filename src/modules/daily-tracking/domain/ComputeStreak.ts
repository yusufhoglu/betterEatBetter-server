import type { StreakSummary } from './DayCompletion';

/** Computes streaks from a chronological oldest->newest completion list. */
export function computeStreak(completions: boolean[]): StreakSummary {
  let longestStreak = 0;
  let runningLongest = 0;

  for (const completed of completions) {
    if (completed) {
      runningLongest += 1;
      longestStreak = Math.max(longestStreak, runningLongest);
      continue;
    }

    runningLongest = 0;
  }

  let currentIndex = completions.length - 1;

  // The latest incomplete day is treated as "not completed yet", so it does
  // not break the current streak but also does not extend it.
  if (currentIndex >= 0 && !completions[currentIndex]) {
    currentIndex -= 1;
  }

  let currentStreak = 0;
  while (currentIndex >= 0 && completions[currentIndex]) {
    currentStreak += 1;
    currentIndex -= 1;
  }

  return { currentStreak, longestStreak };
}
