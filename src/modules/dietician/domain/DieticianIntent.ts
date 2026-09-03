import { z } from 'zod';

/**
 * How a turn is routed:
 * - `advice`     — "what should I eat", plan adjustments, review my day. Needs
 *                  data gathering + the prime model.
 * - `quick_fact` — a bounded nutrition question ("how much protein in an egg").
 *                  May still want a tool; answered by the prime model.
 * - `log_help`   — the user described a meal and wants help logging it. Arms
 *                  the propose_meal_log tool.
 * - `smalltalk`  — greetings, thanks, chit-chat. Cheap model, no gathering.
 */
export const dieticianIntents = ['advice', 'quick_fact', 'log_help', 'smalltalk'] as const;

export type DieticianIntent = (typeof dieticianIntents)[number];

export const dieticianIntentSchema = z.object({
  intent: z.enum(dieticianIntents).describe('The single best-fitting category for the latest user message.'),
});

/** Only `smalltalk` skips gathering + the prime model. */
export function needsAssistedLane(intent: DieticianIntent): boolean {
  return intent !== 'smalltalk';
}
