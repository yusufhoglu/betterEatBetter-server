import { proposalToLoggedMealEntries } from './mealProposalUtils';
import type { MealLogProposal } from './MealLogProposal';

describe('proposalToLoggedMealEntries', () => {
  it('preserves mealPhotoId for photo-seeded proposals', () => {
    const proposal: MealLogProposal = {
      rawDescription: 'Photo estimate from meal photo photo-1',
      entries: [
        {
          id: 'photo-1',
          userId: 'user-1',
          source: 'photo',
          status: 'completed',
          items: [
            {
              name: 'Omelette',
              portionGrams: 150,
              calories: 320,
              proteinGrams: 22,
              carbsGrams: 8,
              fatGrams: 21,
            },
          ],
          macros: {
            totalCalories: 320,
            totalProteinGrams: 22,
            totalCarbsGrams: 8,
            totalFatGrams: 21,
          },
          needsUserAction: false,
          createdAt: new Date('2026-08-25T08:00:00.000Z'),
        },
      ],
    };

    expect(proposalToLoggedMealEntries(proposal)).toEqual([
      expect.objectContaining({
        mealPhotoId: 'photo-1',
        name: 'Omelette',
        source: 'photo',
        portionGrams: 150,
        calories: 320,
        proteinG: 22,
        carbsG: 8,
        fatG: 21,
      }),
    ]);
  });
});
