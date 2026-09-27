import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ValidateMacroOverride } from '../domain/ValidateMacroOverride';
import type { Plan, PlanRepositoryPort } from '../ports/PlanRepositoryPort';

export interface SetDietitianPlanTargetsInput {
  clientId: string;
  dietitianId: string;
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
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
