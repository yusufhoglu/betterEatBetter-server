import type { DayRecord } from '../domain/analytics';

/**
 * Read (and plan-write) access to a client's data owned by other modules.
 * Adapters bridge to those modules' public use-cases. Authorization and
 * consent are checked by ClientAccessPolicy BEFORE any call here — this port
 * trusts its caller.
 */

export interface ClientMealEntry {
  id: string;
  name: string;
  portionGrams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  photoUrl: string | null;
}

export interface ClientMeal {
  mealType: string;
  entries: ClientMealEntry[];
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  photoUrls: string[];
}

export interface NutrientTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface ClientDay {
  date: string; // YYYY-MM-DD
  meals: ClientMeal[];
  consumed: NutrientTotals;
  goals: { calories: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null };
}

export interface ClientBodyMeasurement {
  id: string;
  metric: string;
  value: number;
  unit: string;
  date: Date;
}

export interface ClientPlan {
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: 'self' | 'dietitian';
  setByDietitianId: string | null;
  /** null = automatic. */
  waterTargetMl: number | null;
  stepTarget: number | null;
  updatedAt: Date;
}

export interface ClientActivity {
  clientId: string;
  /** Most recent day with at least one logged meal, YYYY-MM-DD. */
  lastLoggedDate: string | null;
  /** Distinct days with a logged meal in the last 7 days (including today). */
  daysLoggedLast7: number;
  latestWeightKg: number | null;
}

export interface ClientTargets {
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
  steps: number;
  waterAuto: boolean;
  stepsAuto: boolean;
  source: 'self' | 'dietitian';
}

export interface ClientGoal {
  goal: 'lose' | 'maintain' | 'gain';
  targetWeightKg: number | null;
  heightCm: number;
}

/** Which data sources to read — callers pass the client's CURRENT consent. */
export interface DataSelection {
  meals: boolean;
  water: boolean;
  steps: boolean;
}

export interface ClientDataPort {
  /** Day-by-day records (every day in range present, oldest first) + raw food entries for rankings. */
  getDayRecords(
    clientId: string,
    from: Date,
    to: Date,
    selection: DataSelection,
  ): Promise<{ days: DayRecord[]; foods: Array<{ date: string; name: string; calories: number }> }>;
  getTargets(clientId: string): Promise<ClientTargets | null>;
  getGoal(clientId: string): Promise<ClientGoal | null>;
  getSteps(clientId: string, from: Date, to: Date): Promise<Array<{ date: string; steps: number }>>;
  getDay(clientId: string, date: Date, includePhotos: boolean): Promise<ClientDay>;
  listBodyMeasurements(
    clientId: string,
    input: { metric?: string; limit?: number; cursor?: string },
  ): Promise<ClientBodyMeasurement[]>;
  getWaterForDay(clientId: string, date: Date): Promise<{ date: string; amountMl: number }>;
  getPlan(clientId: string): Promise<ClientPlan | null>;
  setPlanTargets(
    clientId: string,
    dietitianId: string,
    targets: {
      dailyCalories: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      waterTargetMl?: number | null;
      stepTarget?: number | null;
    },
  ): Promise<ClientPlan>;
  releasePlan(clientId: string): Promise<void>;
  getActivity(clientIds: string[], today: Date): Promise<Map<string, ClientActivity>>;
}
