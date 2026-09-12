import type { WaterLogRepositoryPort } from '../ports/WaterLogRepositoryPort';
import type { WaterForDay } from './GetWaterForDay';

export interface AddWaterInput {
  userId: string;
  date: Date;
  amountMl: number;
}

export class AddWater {
  constructor(private readonly repository: WaterLogRepositoryPort) {}

  async execute(input: AddWaterInput): Promise<WaterForDay> {
    const log = await this.repository.addAmount(input.userId, input.date, input.amountMl);
    return { date: input.date, amountMl: log.amountMl };
  }
}
