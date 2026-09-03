import type { MealLogProposal } from './MealLogProposal';

/**
 * What `RunDieticianTurn` yields. The controller maps each variant to its own
 * SSE event so mobile renders a text bubble vs. a proposal card.
 */
export type DieticianStreamChunk =
  | { type: 'text'; delta: string }
  | { type: 'proposal'; proposal: MealLogProposal };
