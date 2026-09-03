import type { MealLogProposal } from './MealLogProposal';

/** Prefix marking a persisted assistant message that actually carries a meal proposal. */
export const PROPOSAL_MESSAGE_PREFIX = '__DIETICIAN_PROPOSAL__:';

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

export function findLatestProposal(messages: Array<{ proposal?: MealLogProposal }>): MealLogProposal | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const proposal = messages[index]?.proposal;
    if (proposal) {
      return proposal;
    }
  }

  return null;
}
