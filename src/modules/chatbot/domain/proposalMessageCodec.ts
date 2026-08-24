import type { MealLogProposal } from './MealLogProposal';

export const PROPOSAL_MESSAGE_PREFIX = '__CHAT_PROPOSAL__:';

export function encodeProposalMessage(proposal: MealLogProposal): string {
  return `${PROPOSAL_MESSAGE_PREFIX}${JSON.stringify(proposal)}`;
}

export function decodeProposalMessage(content: string): MealLogProposal | null {
  if (!content.startsWith(PROPOSAL_MESSAGE_PREFIX)) {
    return null;
  }

  try {
    return JSON.parse(content.slice(PROPOSAL_MESSAGE_PREFIX.length)) as MealLogProposal;
  } catch {
    return null;
  }
}
