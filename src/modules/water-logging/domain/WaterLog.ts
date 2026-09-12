export interface WaterLog {
  id: string;
  userId: string;
  date: Date;
  amountMl: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Step size for a single tap of "remove last" — mirrors the mobile stepper. */
export const WATER_LOG_STEP_ML = 200;
