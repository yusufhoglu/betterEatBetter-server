import { WATER_LOG_STEP_ML } from '../domain/WaterLog';
import type { WaterLogRepositoryPort } from '../ports/WaterLogRepositoryPort';
import type { WaterForDay } from './GetWaterForDay';

export interface RemoveLastWaterInput {
  userId: string;
  date: Date;
}

/**
 * Undoes one "add water" tap. There's no per-entry history (see WaterLog's
 * doc comment), so this just steps the running total back down by the fixed
 * increment — matching the mobile stepper's own client-side fallback before
 * this endpoint existed (see ApiHomeRepository.removeLastWater).
 */
export class RemoveLastWater {
  constructor(private readonly repository: WaterLogRepositoryPort) {}

  async execute(input: RemoveLastWaterInput): Promise<WaterForDay> {
    const existing = await this.repository.findByUserIdAndDate(input.userId, input.date);
    const current = existing?.amountMl ?? 0;
    if (current < WATER_LOG_STEP_ML) {
      // Nothing to undo below one increment — leave the total as-is rather
      // than clamping a partial amount down to 0.
      return { date: input.date, amountMl: current };
    }

    const log = await this.repository.addAmount(input.userId, input.date, -WATER_LOG_STEP_ML);
    return { date: input.date, amountMl: log.amountMl };
  }
}
