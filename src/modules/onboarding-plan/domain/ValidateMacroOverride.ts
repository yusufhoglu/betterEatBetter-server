import { ValidationError } from '../../../shared/errors/ValidationError';

export interface MacroOverrideInput {
  dailyCalories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

const MAX_DAILY_CALORIES = 6000;
const MAX_PROTEIN_G = 400;
const MAX_CARBS_G = 800;
const MAX_FAT_G = 250;
const CALORIE_TOLERANCE = 120;

export function ValidateMacroOverride(input: MacroOverrideInput): void {
  if (input.dailyCalories !== undefined && (input.dailyCalories < 1000 || input.dailyCalories > MAX_DAILY_CALORIES)) {
    throw new ValidationError('INVALID_MACRO_OVERRIDE', 'dailyCalories must stay between 1000 and 6000');
  }

  if (input.proteinG !== undefined && (input.proteinG < 0 || input.proteinG > MAX_PROTEIN_G)) {
    throw new ValidationError('INVALID_MACRO_OVERRIDE', 'proteinG is outside the supported range');
  }

  if (input.carbsG !== undefined && (input.carbsG < 0 || input.carbsG > MAX_CARBS_G)) {
    throw new ValidationError('INVALID_MACRO_OVERRIDE', 'carbsG is outside the supported range');
  }

  if (input.fatG !== undefined && (input.fatG < 0 || input.fatG > MAX_FAT_G)) {
    throw new ValidationError('INVALID_MACRO_OVERRIDE', 'fatG is outside the supported range');
  }

  if (
    input.dailyCalories !== undefined &&
    input.proteinG !== undefined &&
    input.carbsG !== undefined &&
    input.fatG !== undefined
  ) {
    const macroCalories = input.proteinG * 4 + input.carbsG * 4 + input.fatG * 9;
    if (Math.abs(macroCalories - input.dailyCalories) > CALORIE_TOLERANCE) {
      throw new ValidationError(
        'INVALID_MACRO_OVERRIDE',
        'Macro calories must stay reasonably aligned with dailyCalories',
      );
    }
  }
}
