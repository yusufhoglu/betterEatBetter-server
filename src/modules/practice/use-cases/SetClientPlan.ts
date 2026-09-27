import type { ClientDataPort, ClientPlan } from '../ports/ClientDataPort';
import type { LinkThreadPort } from '../ports/LinkThreadPort';
import type { ClientAccessPolicy } from './ClientAccessPolicy';

export interface SetClientPlanInput {
  dietitianId: string;
  clientId: string;
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** The assigned dietitian takes over the client's daily targets (the client can no longer edit macros). */
export class SetClientPlan {
  constructor(
    private readonly clientData: ClientDataPort,
    private readonly threads: LinkThreadPort,
    private readonly policy: ClientAccessPolicy,
  ) {}

  async execute(input: SetClientPlanInput): Promise<ClientPlan> {
    const link = await this.policy.assertAssigned(input.dietitianId, input.clientId);
    const plan = await this.clientData.setPlanTargets(input.clientId, input.dietitianId, {
      dailyCalories: input.dailyCalories,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatG: input.fatG,
    });
    await this.threads.postSystemMessage(
      link.id,
      `Günlük hedefler güncellendi: ${Math.round(plan.dailyCalories)} kcal · P ${Math.round(plan.proteinG)} g · K ${Math.round(plan.carbsG)} g · Y ${Math.round(plan.fatG)} g`,
    );
    return plan;
  }
}
