import type { MealLogProposal } from './MealLogProposal';

export type ChatStreamChunk = { type: 'text'; delta: string } | { type: 'proposal'; proposal: MealLogProposal };
