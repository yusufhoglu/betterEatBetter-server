import { z } from 'zod';

/**
 * How a turn is routed:
 * - `advice`     — "what should I eat", plan adjustments, review my day. Needs
 *                  data gathering + the prime model.
 * - `quick_fact` — a bounded nutrition question ("how much protein in an egg").
 *                  May still want a tool; answered by the prime model.
 * - `log_help`   — the user described a meal and wants help logging it. Forces
 *                  the propose_meal_log tool in the gather stage.
 * - `rate_meal`  — asks how good / how healthy a meal is. Forces rate_meal.
 * - `recipe`     — explicitly asks for a recipe / a lighter variant. Forces
 *                  provide_recipe.
 * - `smalltalk`  — greetings, thanks, chit-chat. Cheap model, no gathering.
 *
 * `log_help` / `rate_meal` / `recipe` each force their card tool because the
 * cheap gather model is unreliable at deciding to call it on its own —
 * especially when the conversation is not in English.
 */
export const dieticianIntents = ['advice', 'quick_fact', 'log_help', 'rate_meal', 'recipe', 'smalltalk'] as const;

export type DieticianIntent = (typeof dieticianIntents)[number];

export const dieticianIntentSchema = z.object({
  intent: z.enum(dieticianIntents).describe('The single best-fitting category for the latest user message.'),
});

/** Only `smalltalk` skips gathering + the prime model. */
export function needsAssistedLane(intent: DieticianIntent): boolean {
  return intent !== 'smalltalk';
}

/**
 * The card tool the gather stage must force for this intent, or `null` when the
 * turn produces no card. Forcing is skipped if the named tool is not armed.
 */
export function forcedCardToolForIntent(intent: DieticianIntent): string | null {
  switch (intent) {
    case 'log_help':
      return 'propose_meal_log';
    case 'rate_meal':
      return 'rate_meal';
    case 'recipe':
      return 'provide_recipe';
    default:
      return null;
  }
}
