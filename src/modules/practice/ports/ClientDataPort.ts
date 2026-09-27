/**
 * Read (and plan-write) access to a client's data owned by other modules.
 * Adapters bridge to those modules' public use-cases. Authorization and
 * consent are checked by ClientAccessPolicy BEFORE any call here — this port
 * trusts its caller.
 */

export interface ClientMealEntry {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  quantity: number | null;
  unit: string | null;
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

export interface ClientDay {
  date: string; // YYYY-MM-DD
  meals: ClientMeal[];
  consumed: { calories: number; proteinG: number; carbsG: number; fatG: number };
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

export interface ClientDataPort {
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
    targets: { dailyCalories: number; proteinG: number; carbsG: number; fatG: number },
  ): Promise<ClientPlan>;
  releasePlan(clientId: string): Promise<void>;
  getActivity(clientIds: string[], today: Date): Promise<Map<string, ClientActivity>>;
}
