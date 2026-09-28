import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { STEP_TARGET_RANGE, WATER_TARGET_RANGE } from '../domain/ComputeActivityTargets';
import { ValidateMacroOverride } from '../domain/ValidateMacroOverride';
import type { Plan, PlanRepositoryPort } from '../ports/PlanRepositoryPort';

export interface SetDietitianPlanTargetsInput {
  clientId: string;
  dietitianId: string;
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Omitted → unchanged; null → back to automatic. */
  waterTargetMl?: number | null;
  stepTarget?: number | null;
}

function assertInRange(value: number | null | undefined, range: { min: number; max: number }, field: string): void {
  if (value != null && (!Number.isInteger(value) || value < range.min || value > range.max)) {
    throw new ValidationError('INVALID_ACTIVITY_TARGET', `${field} must be an integer between ${range.min} and ${range.max}`);
  }
}

/**
 * Public entry point for the practice module: a client's assigned dietitian
 * takes ownership of their daily targets. From then on UpdatePlan refuses
 * client macro edits and UpdateProfileMeasurements stops recomputing them,
 * until ReleaseDietitianPlan hands ownership back. Authorization (is this the
 * client's dietitian?) is the caller's job.
 */
export class SetDietitianPlanTargets {
  constructor(private readonly planRepository: PlanRepositoryPort) {}

  async execute(input: SetDietitianPlanTargetsInput): Promise<Plan> {
    ValidateMacroOverride(input);
    assertInRange(input.waterTargetMl, WATER_TARGET_RANGE, 'waterTargetMl');
    assertInRange(input.stepTarget, STEP_TARGET_RANGE, 'stepTarget');

    const existing = await this.planRepository.findByUserId(input.clientId);
    if (!existing) {
      throw new NotFoundError('NOT_ONBOARDED', 'Client has not completed onboarding');
    }

    return this.planRepository.update({
      userId: input.clientId,
      dailyCalories: input.dailyCalories,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatG: input.fatG,
      source: 'dietitian',
      setByDietitianId: input.dietitianId,
      waterTargetMl: input.waterTargetMl,
      stepTarget: input.stepTarget,
    });
  }
}

/** Hands a dietitian-owned plan back to the client (link ended). Keeps the current targets. */
export class ReleaseDietitianPlan {
  constructor(private readonly planRepository: PlanRepositoryPort) {}

  async execute(clientId: string): Promise<void> {
    const existing = await this.planRepository.findByUserId(clientId);
    if (!existing || existing.source !== 'dietitian') {
      return;
    }

    await this.planRepository.update({
      userId: clientId,
      dailyCalories: existing.dailyCalories,
      proteinG: existing.proteinG,
      carbsG: existing.carbsG,
      fatG: existing.fatG,
      source: 'self',
      setByDietitianId: null,
    });
  }
}
