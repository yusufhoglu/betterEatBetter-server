import type { NotificationPreferences, NotificationPreferencesPort } from '../../ports/NotificationPreferencesPort';
import type { DayCompletionPort, TodayCompletion } from '../../ports/DayCompletionPort';
import type { WeeklySummary, WeeklySummaryPort } from '../../ports/WeeklySummaryPort';
import type { SendGuardPort } from '../../jobs/SendGuard';

export const defaultNotificationPreferences: NotificationPreferences = {
  masterEnabled: true,
  breakfast: { enabled: true, time: '08:30' },
  lunch: { enabled: true, time: '12:30' },
  dinner: { enabled: true, time: '19:30' },
  waterReminders: true,
  streakSaver: true,
  weeklyReport: true,
};

export class FakeNotificationPreferences implements NotificationPreferencesPort {
  readonly calls: string[] = [];
  private readonly byUser = new Map<string, NotificationPreferences>();

  set(userId: string, prefs: Partial<NotificationPreferences>): void {
    this.byUser.set(userId, { ...defaultNotificationPreferences, ...prefs });
  }

  async get(userId: string): Promise<NotificationPreferences> {
    this.calls.push(userId);
    return this.byUser.get(userId) ?? defaultNotificationPreferences;
  }
}

export class FakeDayCompletion implements DayCompletionPort {
  private readonly byUser = new Map<string, TodayCompletion>();

  set(userId: string, status: TodayCompletion): void {
    this.byUser.set(userId, status);
  }

  async getTodayStatus(userId: string): Promise<TodayCompletion> {
    return this.byUser.get(userId) ?? { completed: false, currentStreak: 0 };
  }
}

export class FakeWeeklySummary implements WeeklySummaryPort {
  private readonly byUser = new Map<string, WeeklySummary>();

  set(userId: string, summary: WeeklySummary): void {
    this.byUser.set(userId, summary);
  }

  async getForUser(userId: string): Promise<WeeklySummary> {
    return this.byUser.get(userId) ?? { daysCompleted: 0, currentStreak: 0, avgCalories: 0 };
  }
}

/** In-memory {@link SendGuardPort}: first claim of a key wins, like the real Redis NX guard. */
export class FakeSendGuard implements SendGuardPort {
  readonly claimed = new Set<string>();

  async claim(key: string): Promise<boolean> {
    if (this.claimed.has(key)) {
      return false;
    }
    this.claimed.add(key);
    return true;
  }
}
