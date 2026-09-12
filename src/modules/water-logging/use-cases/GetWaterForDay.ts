import type { WaterLogRepositoryPort } from '../ports/WaterLogRepositoryPort';

export interface GetWaterForDayInput {
  userId: string;
  date: Date;
}

export interface WaterForDay {
  date: Date;
  amountMl: number;
}

export class GetWaterForDay {
  constructor(private readonly repository: WaterLogRepositoryPort) {}

  async execute(input: GetWaterForDayInput): Promise<WaterForDay> {
    const log = await this.repository.findByUserIdAndDate(input.userId, input.date);
    return { date: input.date, amountMl: log?.amountMl ?? 0 };
  }
}
