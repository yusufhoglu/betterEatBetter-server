import { z } from 'zod';

/**
 * A rolling, structured summary of a dietician conversation. Rebuilt by the
 * cheap model every `DIETICIAN_DIGEST_EVERY_N_TURNS` turns and injected as a
 * `system` message, so trimming the oldest turns out of the context window
 * never loses the thread of what the user is working on.
 */
export const conversationDigestSchema = z.object({
  goalsRecap: z
    .string()
    .describe("The user's current goal and target in one or two sentences (weight goal, calorie/macro focus)."),
  adviceGivenRecap: z
    .string()
    .describe('The concrete advice already given in this conversation, so it is not repeated.'),
  openThreads: z
    .string()
    .describe('Anything left unresolved — a question the user asked, a plan they said they would try.'),
  learnedPreferences: z
    .string()
    .describe('Durable facts learned about the user: foods they dislike, dietary restrictions, schedule, cooking ability.'),
});

export type ConversationDigest = z.infer<typeof conversationDigestSchema>;

export function formatDigestForPrompt(digest: ConversationDigest): string {
  return [
    'Conversation so far (rolling summary):',
    `- Goal: ${digest.goalsRecap}`,
    `- Advice already given: ${digest.adviceGivenRecap}`,
    `- Open threads: ${digest.openThreads}`,
    `- Known preferences: ${digest.learnedPreferences}`,
  ].join('\n');
}
