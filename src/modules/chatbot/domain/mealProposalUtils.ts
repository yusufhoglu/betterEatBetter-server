import { randomUUID } from 'node:crypto';
import type { FoodEntry } from '../../food-recognition/domain/FoodEntry';
import type { Conversation } from './Conversation';
import type { MealLogProposal } from './MealLogProposal';
import type { Message } from './Message';
import type { LoggedMealEntry } from '../../nutrition-logging/domain/MealItem';

export function findLatestProposal(messages: Message[]): MealLogProposal | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const proposal = messages[index]?.proposal;
    if (proposal) {
      return proposal;
    }
  }

  return null;
}

export function requireLatestProposal(conversation: Conversation): MealLogProposal | null {
  return findLatestProposal(conversation.messages);
}

export function foodEntryToProposal(entry: FoodEntry, rawDescription: string): MealLogProposal {
  return {
    rawDescription,
    entries: [entry],
  };
}

export function proposalToLoggedMealEntries(proposal: MealLogProposal): LoggedMealEntry[] {
  return proposal.entries.flatMap((entry) =>
    entry.items.map((item) => ({
      id: randomUUID(),
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

export function summarizeProposalForLlm(proposal: MealLogProposal): string {
  const lines: string[] = [`Current meal draft from conversation: ${proposal.rawDescription}`];

  for (const [entryIndex, entry] of proposal.entries.entries()) {
    lines.push(
      `Entry ${entryIndex + 1}: source=${entry.source}, status=${entry.status}, needsUserAction=${entry.needsUserAction}, totalCalories=${entry.macros.totalCalories}, totalProteinGrams=${entry.macros.totalProteinGrams}, totalCarbsGrams=${entry.macros.totalCarbsGrams}, totalFatGrams=${entry.macros.totalFatGrams}`,
    );

    for (const [itemIndex, item] of entry.items.entries()) {
      lines.push(
        `- Item ${itemIndex + 1}: name=${item.name}, portionGrams=${item.portionGrams}, calories=${item.calories}, proteinGrams=${item.proteinGrams}, carbsGrams=${item.carbsGrams}, fatGrams=${item.fatGrams}`,
      );
    }
  }

  lines.push('If the user wants to modify this draft, revise the same meal instead of starting from zero unless they clearly switch meals.');

  return lines.join('\n');
}
