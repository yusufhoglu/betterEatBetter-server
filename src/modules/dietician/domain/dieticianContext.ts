import type { ConversationDigest } from './ConversationDigest';
import { formatDigestForPrompt } from './ConversationDigest';

export type Goal = 'lose' | 'maintain' | 'gain';

/** Stable per-user coaching context — changes rarely, injected eagerly every turn. */
export interface PlanContext {
  goal: Goal;
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  currentWeightKg: number;
  targetWeightKg: number | null;
  workoutsPerWeek: number;
  age: number;
  gender: string;
}

/** Volatile per-day context — today's intake vs. targets. */
export interface DailySnapshot {
  date: string;
  consumedCalories: number;
  remainingCalories: number | null;
  loggedMealTypes: string[];
}

export interface DieticianContext {
  plan: PlanContext | null;
  snapshot: DailySnapshot | null;
  digest: ConversationDigest | null;
}

/**
 * Assembles the eager context block injected as a `system` message so the
 * dietician always knows the user's plan + today's intake without spending a
 * tool round-trip. Returns null when there is nothing worth injecting (a user
 * who has not onboarded and has no digest yet).
 */
export function buildDieticianContextBlock(context: DieticianContext): string | null {
  const sections: string[] = [];

  if (context.plan) {
    const { plan } = context;
    sections.push(
      [
        'User plan:',
        `- Goal: ${plan.goal} weight`,
        `- Daily target: ${Math.round(plan.dailyCalories)} kcal ` +
          `(${Math.round(plan.proteinG)}P / ${Math.round(plan.carbsG)}C / ${Math.round(plan.fatG)}F g)`,
        `- Current weight: ${plan.currentWeightKg} kg` +
          (plan.targetWeightKg !== null ? `, target ${plan.targetWeightKg} kg` : ''),
        `- Training: ${plan.workoutsPerWeek} workouts/week · age ${plan.age} · ${plan.gender}`,
      ].join('\n'),
    );
  }

  if (context.snapshot) {
    const { snapshot } = context;
    const logged = snapshot.loggedMealTypes.length > 0 ? snapshot.loggedMealTypes.join(', ') : 'nothing yet';
    sections.push(
      [
        `Today (${snapshot.date}):`,
        `- Consumed: ${Math.round(snapshot.consumedCalories)} kcal`,
        snapshot.remainingCalories !== null
          ? `- Remaining vs. target: ${Math.round(snapshot.remainingCalories)} kcal`
          : '- Remaining vs. target: unknown (no plan)',
        `- Meals logged: ${logged}`,
      ].join('\n'),
    );
  }

  if (context.digest) {
    sections.push(formatDigestForPrompt(context.digest));
  }

  return sections.length > 0 ? sections.join('\n\n') : null;
}
