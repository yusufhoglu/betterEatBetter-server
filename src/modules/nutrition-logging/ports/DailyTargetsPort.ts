export interface DailyTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface DailyTargetsPort {
  getDailyTargets(userId: string): Promise<DailyTargets | null>;
}
