import { randomUUID } from 'node:crypto';
import type { LoggedMealEntry } from '../../nutrition-logging/domain/MealItem';
import type { DieticianConversation } from './DieticianConversation';
import type { MealLogProposal } from './MealLogProposal';

export function requireLatestProposal(conversation: DieticianConversation): MealLogProposal | null {
  for (let index = conversation.messages.length - 1; index >= 0; index--) {
    const proposal = conversation.messages[index]?.proposal;
    if (proposal) {
      return proposal;
    }
  }
  return null;
}

/** Flattens a proposal into the entry shape LogMealEntries / ReplaceMealSlotEntries expect. */
export function proposalToLoggedMealEntries(proposal: MealLogProposal): LoggedMealEntry[] {
  return proposal.entries.flatMap((entry) =>
    entry.items.map((item) => ({
      id: randomUUID(),
      ...(entry.source === 'photo' ? { mealPhotoId: entry.id } : {}),
      name: item.name,
      source: entry.source,
      portionGrams: item.portionGrams,
      calories: item.calories,
      proteinG: item.proteinGrams,
      carbsG: item.carbsGrams,
      fatG: item.fatGrams,
    })),
  );
}

/** Compact text form of a proposal, appended to LLM history so the model can reference the draft. */
export function summarizeProposalForLlm(proposal: MealLogProposal): string {
  const lines: string[] = [`Current meal draft: ${proposal.rawDescription}`];

  for (const [entryIndex, entry] of proposal.entries.entries()) {
    lines.push(
      `Entry ${entryIndex + 1}: totalCalories=${entry.macros.totalCalories}, ` +
        `totalProteinGrams=${entry.macros.totalProteinGrams}, ` +
        `totalCarbsGrams=${entry.macros.totalCarbsGrams}, ` +
        `totalFatGrams=${entry.macros.totalFatGrams}, needsUserAction=${entry.needsUserAction}`,
    );
    for (const [itemIndex, item] of entry.items.entries()) {
      lines.push(
        `- Item ${itemIndex + 1}: ${item.name}, portionGrams=${item.portionGrams}, calories=${item.calories}`,
      );
    }
  }

  return lines.join('\n');
}
