export interface UnitPreferences {
  weightUnit: 'kg' | 'lbs';
  heightUnit: 'cm' | 'ft/in';
  energyUnit: 'kcal' | 'kJ';
  waterUnit: 'ml' | 'fl oz';
}

export interface NotificationPreferences {
  masterEnabled: boolean;
  breakfast: {
    enabled: boolean;
    time: string;
  };
  lunch: {
    enabled: boolean;
    time: string;
  };
  dinner: {
    enabled: boolean;
    time: string;
  };
  waterReminders: boolean;
  streakSaver: boolean;
  weeklyReport: boolean;
}

export interface NotificationPreferencesPatch {
  masterEnabled?: boolean;
  breakfast?: {
    enabled?: boolean;
    time?: string;
  };
  lunch?: {
    enabled?: boolean;
    time?: string;
  };
  dinner?: {
    enabled?: boolean;
    time?: string;
  };
  waterReminders?: boolean;
  streakSaver?: boolean;
  weeklyReport?: boolean;
}

export interface MePreferencesRepositoryPort {
  getUnitPreferences(userId: string): Promise<UnitPreferences>;
  upsertUnitPreferences(userId: string, input: Partial<UnitPreferences>): Promise<UnitPreferences>;
  getNotificationPreferences(userId: string): Promise<NotificationPreferences>;
  upsertNotificationPreferences(userId: string, input: NotificationPreferencesPatch): Promise<NotificationPreferences>;
}
