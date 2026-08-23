import { RecognizeFromText } from './RecognizeFromText';
import type { TextEstimatorPort, TextEstimateResult } from '../ports/TextEstimatorPort';

function makeEstimator(result: TextEstimateResult): TextEstimatorPort {
  return { estimate: jest.fn().mockResolvedValue(result) };
}

const SUFFICIENT_RESULT: TextEstimateResult = {
  status: 'sufficient',
  items: [
    {
      name: 'Oatmeal',
      portionGrams: 100,
      calories: 71,
      proteinGrams: 2.5,
      carbsGrams: 12,
      fatGrams: 1.5,
    },
  ],
  macros: { totalCalories: 71, totalProteinGrams: 2.5, totalCarbsGrams: 12, totalFatGrams: 1.5 },
};

const INSUFFICIENT_RESULT: TextEstimateResult = {
  status: 'insufficient_data',
  items: [],
  macros: { totalCalories: 0, totalProteinGrams: 0, totalCarbsGrams: 0, totalFatGrams: 0 },
};

describe('RecognizeFromText', () => {
  it('returns needsUserAction=false when estimator returns sufficient', async () => {
    const useCase = new RecognizeFromText(makeEstimator(SUFFICIENT_RESULT));
    const result = await useCase.execute({ text: 'a bowl of oatmeal', userId: 'user-1' });

    expect(result.needsUserAction).toBe(false);
    expect(result.source).toBe('text');
    expect(result.items).toEqual(SUFFICIENT_RESULT.items);
  });

  it('returns needsUserAction=true when estimator returns insufficient_data', async () => {
    const useCase = new RecognizeFromText(makeEstimator(INSUFFICIENT_RESULT));
    const result = await useCase.execute({ text: 'some food', userId: 'user-1' });

    expect(result.needsUserAction).toBe(true);
    expect(result.source).toBe('text');
    // Items are empty — user must fill in
    expect(result.items).toHaveLength(0);
  });
});
