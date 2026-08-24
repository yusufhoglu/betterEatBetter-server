import type { PrismaClient } from '@prisma/client';
import type {
  MePreferencesRepositoryPort,
  NotificationPreferences,
  NotificationPreferencesPatch,
  UnitPreferences,
} from '../../ports/MePreferencesRepositoryPort';

const defaultUnitPreferences: UnitPreferences = {
  weightUnit: 'kg',
  heightUnit: 'cm',
  energyUnit: 'kcal',
  waterUnit: 'ml',
};

const defaultNotificationPreferences: NotificationPreferences = {
  masterEnabled: true,
  breakfast: { enabled: true, time: '08:30' },
  lunch: { enabled: true, time: '12:30' },
  dinner: { enabled: true, time: '19:30' },
  waterReminders: true,
  streakSaver: true,
  weeklyReport: true,
};

function toUnitPreferences(row: {
  weightUnit: string;
  heightUnit: string;
  energyUnit: string;
  waterUnit: string;
} | null): UnitPreferences {
  if (!row) {
    return defaultUnitPreferences;
  }

  return {
    weightUnit: row.weightUnit as UnitPreferences['weightUnit'],
    heightUnit: row.heightUnit as UnitPreferences['heightUnit'],
    energyUnit: row.energyUnit as UnitPreferences['energyUnit'],
    waterUnit: row.waterUnit as UnitPreferences['waterUnit'],
  };
}

function toNotificationPreferences(row: {
  masterEnabled: boolean;
  breakfastEnabled: boolean;
  breakfastTime: string;
  lunchEnabled: boolean;
  lunchTime: string;
  dinnerEnabled: boolean;
  dinnerTime: string;
  waterReminders: boolean;
  streakSaver: boolean;
  weeklyReport: boolean;
} | null): NotificationPreferences {
  if (!row) {
    return defaultNotificationPreferences;
  }

  return {
    masterEnabled: row.masterEnabled,
    breakfast: {
      enabled: row.breakfastEnabled,
      time: row.breakfastTime,
    },
    lunch: {
      enabled: row.lunchEnabled,
      time: row.lunchTime,
    },
    dinner: {
      enabled: row.dinnerEnabled,
      time: row.dinnerTime,
    },
    waterReminders: row.waterReminders,
    streakSaver: row.streakSaver,
    weeklyReport: row.weeklyReport,
  };
}

export class PrismaMePreferencesRepository implements MePreferencesRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  async getUnitPreferences(userId: string): Promise<UnitPreferences> {
    return toUnitPreferences(await this.db.unitPreference.findUnique({ where: { userId } }));
  }

  async upsertUnitPreferences(userId: string, input: Partial<UnitPreferences>): Promise<UnitPreferences> {
    const row = await this.db.unitPreference.upsert({
      where: { userId },
      create: {
        userId,
        weightUnit: input.weightUnit ?? defaultUnitPreferences.weightUnit,
        heightUnit: input.heightUnit ?? defaultUnitPreferences.heightUnit,
        energyUnit: input.energyUnit ?? defaultUnitPreferences.energyUnit,
        waterUnit: input.waterUnit ?? defaultUnitPreferences.waterUnit,
      },
      update: {
        weightUnit: input.weightUnit,
        heightUnit: input.heightUnit,
        energyUnit: input.energyUnit,
        waterUnit: input.waterUnit,
      },
    });

    return toUnitPreferences(row);
  }

  async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    return toNotificationPreferences(await this.db.notificationPreference.findUnique({ where: { userId } }));
  }

  async upsertNotificationPreferences(
    userId: string,
    input: NotificationPreferencesPatch,
  ): Promise<NotificationPreferences> {
    const row = await this.db.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        masterEnabled: input.masterEnabled ?? defaultNotificationPreferences.masterEnabled,
        breakfastEnabled: input.breakfast?.enabled ?? defaultNotificationPreferences.breakfast.enabled,
        breakfastTime: input.breakfast?.time ?? defaultNotificationPreferences.breakfast.time,
        lunchEnabled: input.lunch?.enabled ?? defaultNotificationPreferences.lunch.enabled,
        lunchTime: input.lunch?.time ?? defaultNotificationPreferences.lunch.time,
        dinnerEnabled: input.dinner?.enabled ?? defaultNotificationPreferences.dinner.enabled,
        dinnerTime: input.dinner?.time ?? defaultNotificationPreferences.dinner.time,
        waterReminders: input.waterReminders ?? defaultNotificationPreferences.waterReminders,
        streakSaver: input.streakSaver ?? defaultNotificationPreferences.streakSaver,
        weeklyReport: input.weeklyReport ?? defaultNotificationPreferences.weeklyReport,
      },
      update: {
        masterEnabled: input.masterEnabled,
        breakfastEnabled: input.breakfast?.enabled,
        breakfastTime: input.breakfast?.time,
        lunchEnabled: input.lunch?.enabled,
        lunchTime: input.lunch?.time,
        dinnerEnabled: input.dinner?.enabled,
        dinnerTime: input.dinner?.time,
        waterReminders: input.waterReminders,
        streakSaver: input.streakSaver,
        weeklyReport: input.weeklyReport,
      },
    });

    return toNotificationPreferences(row);
  }
}
